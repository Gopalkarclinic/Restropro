import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'offline_queue.dart';
import 'profile.dart';
import 'strings.dart';
import 'widgets.dart';

/// Captain / manager / owner takes an order at the table. Works offline (menu is cached, order is queued).
class NewOrderPage extends StatefulWidget {
  final Profile profile;
  const NewOrderPage({super.key, required this.profile});
  @override
  State<NewOrderPage> createState() => _NewOrderPageState();
}

class _NewOrderPageState extends State<NewOrderPage> {
  List<Map<String, dynamic>> _menu = [];
  final Map<String, int> _cart = {};
  final _table = TextEditingController();
  String _filter = '';
  bool _loading = true;
  bool _sending = false;

  String get _cacheKey => 'menu_cache_${widget.profile.restaurantId}';

  @override
  void initState() {
    super.initState();
    _loadMenu();
  }

  @override
  void dispose() {
    _table.dispose();
    super.dispose();
  }

  Future<void> _loadMenu() async {
    try {
      final rows = await db
          .from('menu_items')
          .select('id, name, price_paise, is_available')
          .eq('restaurant_id', widget.profile.restaurantId)
          .order('name');
      final list = List<Map<String, dynamic>>.from(rows);
      try {
        final p = await SharedPreferences.getInstance();
        await p.setString(_cacheKey, jsonEncode(list));
      } catch (_) {}
      if (!mounted) return;
      setState(() {
        _menu = list;
        _loading = false;
      });
    } catch (_) {
      // offline: use the last saved menu
      try {
        final p = await SharedPreferences.getInstance();
        final raw = p.getString(_cacheKey);
        if (raw != null && mounted) {
          setState(() => _menu = List<Map<String, dynamic>>.from((jsonDecode(raw) as List).map((e) => Map<String, dynamic>.from(e as Map))));
        }
      } catch (_) {}
      if (mounted) setState(() => _loading = false);
    }
  }

  int get _count => _cart.values.fold(0, (a, b) => a + b);

  int get _total {
    var sum = 0;
    for (final it in _menu) {
      sum += (_cart[it['id']] ?? 0) * (it['price_paise'] as int);
    }
    return sum;
  }

  void _change(String id, int d) {
    setState(() {
      final n = ((_cart[id] ?? 0) + d).clamp(0, 99);
      if (n == 0) {
        _cart.remove(id);
      } else {
        _cart[id] = n;
      }
    });
  }

  Future<void> _send() async {
    final table = _table.text.trim();
    if (table.isEmpty || table.length > 10) return snack(context, t('need_table'));
    if (_cart.isEmpty) return snack(context, t('need_items'));
    setState(() => _sending = true);
    final order = <String, dynamic>{
      'restaurant_id': widget.profile.restaurantId,
      'table_no': table,
      'key': OfflineQueue.newKey(),
      'items': [for (final e in _cart.entries) {'menu_item_id': e.key, 'qty': e.value}],
    };
    try {
      await OfflineQueue.send(order);
      if (!mounted) return;
      snack(context, t('order_sent'));
      _reset();
    } on Object catch (e) {
      if (!mounted) return;
      if (isBusinessError(e)) {
        snack(context, friendlyError(e));
        _loadMenu(); // an item may have run out
      } else {
        await OfflineQueue.add(order); // no internet: save, it will be sent automatically
        if (!mounted) return;
        snack(context, t('saved_offline'));
        _reset();
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  void _reset() {
    setState(() {
      _cart.clear();
      _table.clear();
    });
    OfflineQueue.flush();
  }

  @override
  Widget build(BuildContext context) {
    final q = _filter.toLowerCase();
    final shown = _menu.where((m) => q.isEmpty || (m['name'] as String).toLowerCase().contains(q)).toList();
    return Column(children: [
      Centered(
        maxWidth: 800,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
          child: Row(children: [
            SizedBox(
              width: 120,
              child: TextField(
                controller: _table,
                maxLength: 10,
                textCapitalization: TextCapitalization.characters,
                decoration: InputDecoration(labelText: t('table_no'), counterText: '', border: const OutlineInputBorder()),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: TextField(
                onChanged: (v) => setState(() => _filter = v),
                decoration: InputDecoration(labelText: t('search'), prefixIcon: const Icon(Icons.search), border: const OutlineInputBorder()),
              ),
            ),
          ]),
        ),
      ),
      Expanded(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : Centered(
                maxWidth: 800,
                child: ListView.builder(
                  padding: const EdgeInsets.fromLTRB(12, 4, 12, 12),
                  itemCount: shown.length,
                  itemBuilder: (_, i) {
                    final it = shown[i];
                    final id = it['id'] as String;
                    final on = it['is_available'] == true;
                    final qty = _cart[id] ?? 0;
                    return Card(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                        child: Row(children: [
                          Expanded(
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Text(it['name'] as String, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: on ? null : Colors.grey)),
                              Text(on ? rs(it['price_paise'] as int) : t('sold_out'), style: const TextStyle(color: Color(0xFF6B1E1E), fontWeight: FontWeight.w700)),
                            ]),
                          ),
                          if (on) ...[
                            IconButton.filledTonal(iconSize: 28, onPressed: qty == 0 ? null : () => _change(id, -1), icon: const Icon(Icons.remove)),
                            SizedBox(width: 36, child: Text('$qty', textAlign: TextAlign.center, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800))),
                            IconButton.filled(iconSize: 28, onPressed: () => _change(id, 1), icon: const Icon(Icons.add)),
                          ],
                        ]),
                      ),
                    );
                  },
                ),
              ),
      ),
      SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 4, 12, 12),
          child: Centered(
            maxWidth: 800,
            child: FilledButton(
              onPressed: _sending ? null : _send,
              child: Text(_count == 0 ? t('send_order') : '${t('send_order')}  •  $_count  •  ${rs(_total)}'),
            ),
          ),
        ),
      ),
    ]);
  }
}
