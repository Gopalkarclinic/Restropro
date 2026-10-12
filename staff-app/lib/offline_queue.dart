import 'dart:convert';
import 'dart:math';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'widgets.dart';

/// Orders typed while offline are saved on the phone and sent automatically.
/// Each order has an idempotency key, so sending twice can never create two orders.
class OfflineQueue {
  static const _k = 'pending_orders_v1';
  static final ValueNotifier<int> count = ValueNotifier<int>(0);
  static bool _flushing = false;

  static String newKey() {
    final r = Random.secure();
    final hex = List.generate(12, (_) => r.nextInt(16).toRadixString(16)).join();
    return 'o-${DateTime.now().microsecondsSinceEpoch}-$hex';
  }

  static Future<List<Map<String, dynamic>>> _read() async {
    try {
      final p = await SharedPreferences.getInstance();
      final raw = p.getString(_k);
      if (raw == null) return [];
      return List<Map<String, dynamic>>.from((jsonDecode(raw) as List).map((e) => Map<String, dynamic>.from(e as Map)));
    } catch (_) {
      return [];
    }
  }

  static Future<void> _write(List<Map<String, dynamic>> list) async {
    try {
      final p = await SharedPreferences.getInstance();
      await p.setString(_k, jsonEncode(list));
    } catch (_) {}
    count.value = list.length;
  }

  static Future<void> init() async {
    count.value = (await _read()).length;
  }

  static Future<void> add(Map<String, dynamic> order) async {
    final list = await _read();
    list.add(order);
    await _write(list);
  }

  /// Sends one order. Returns true if it is finished (sent or permanently rejected).
  static Future<bool> send(Map<String, dynamic> o) async {
    try {
      await db
          .rpc('create_staff_order', params: {
            'p_restaurant_id': o['restaurant_id'],
            'p_table_no': o['table_no'],
            'p_idempotency_key': o['key'],
            'p_items': o['items'],
          })
          .timeout(const Duration(seconds: 10));
      return true;
    } catch (e) {
      if (isBusinessError(e)) return true; // rejected by a rule: retrying will never help
      rethrow; // network / timeout / expired session: keep and retry later
    }
  }

  static Future<void> flush() async {
    if (_flushing) return;
    _flushing = true;
    try {
      final list = await _read();
      final keep = <Map<String, dynamic>>[];
      for (var i = 0; i < list.length; i++) {
        try {
          await send(list[i]);
        } catch (_) {
          keep.addAll(list.sublist(i)); // stop at first network failure, keep order of the rest
          break;
        }
      }
      await _write(keep);
    } finally {
      _flushing = false;
    }
  }
}
