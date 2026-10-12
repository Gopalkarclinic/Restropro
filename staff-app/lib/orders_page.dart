import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'bill_dialog.dart';
import 'profile.dart';
import 'strings.dart';
import 'widgets.dart';

// status -> (button label key, next status, roles allowed). Same rules are enforced by the database.
const _flow = <String, (String, String, Set<String>)>{
  'pending_approval': ('act_approve', 'approved', {'owner', 'manager', 'captain'}),
  'approved': ('act_start', 'preparing', {'owner', 'manager', 'kitchen'}),
  'preparing': ('act_ready', 'ready', {'owner', 'manager', 'kitchen'}),
  'ready': ('act_served', 'served', {'owner', 'manager', 'captain'}),
};

const _sections = <String, String>{
  'pending_approval': 'sec_pending',
  'approved': 'sec_approved',
  'preparing': 'sec_preparing',
  'ready': 'sec_ready',
  'served': 'sec_served',
};

class OrdersPage extends StatefulWidget {
  final Profile profile;
  const OrdersPage({super.key, required this.profile});
  @override
  State<OrdersPage> createState() => _OrdersPageState();
}

class _OrdersPageState extends State<OrdersPage> {
  List<Map<String, dynamic>> _orders = [];
  bool _loading = true;
  String? _error;
  RealtimeChannel? _channel;
  Set<String>? _seenAttention; // ids that need MY action; null until first load

  String get _myStatus => widget.profile.role == 'kitchen' ? 'approved' : 'pending_approval';

  @override
  void initState() {
    super.initState();
    _load();
    _channel = db
        .channel('orders-live')
        .onPostgresChanges(event: PostgresChangeEvent.all, schema: 'public', table: 'orders', callback: (_) => _load())
        .subscribe();
  }

  @override
  void dispose() {
    _channel?.unsubscribe();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final now = DateTime.now();
      final dayStart = DateTime(now.year, now.month, now.day).toUtc().toIso8601String();
      final rows = await db
          .from('orders')
          .select('id, table_no, status, source, created_at, order_items(qty, note, menu_items(name)), bills(id)')
          .or('status.in.(pending_approval,approved,preparing,ready),and(status.eq.served,created_at.gte.$dayStart)')
          .order('created_at');
      if (!mounted) return;
      final list = List<Map<String, dynamic>>.from(rows);
      final attention = {for (final o in list) if (o['status'] == _myStatus) o['id'] as String};
      final seen = _seenAttention;
      if (seen != null && attention.difference(seen).isNotEmpty && widget.profile.role != 'owner') {
        alertNewOrder(); // new order that needs this person: sound + vibration
      }
      _seenAttention = attention;
      setState(() {
        _orders = list;
        _loading = false;
        _error = null;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        if (_orders.isEmpty) _error = t('check_net');
      });
    }
  }

  Future<void> _move(String id, String next) async {
    try {
      await db.from('orders').update({'status': next}).eq('id', id);
      await _load();
    } catch (e) {
      if (mounted) snack(context, friendlyError(e));
    }
  }

  Future<void> _cancel(String id) async {
    final c = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(t('act_cancel')),
        content: TextField(controller: c, maxLength: 200, decoration: InputDecoration(labelText: t('cancel_reason'))),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(t('back'))),
          FilledButton(
            style: FilledButton.styleFrom(minimumSize: const Size(120, 44), backgroundColor: Colors.red),
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(t('act_cancel')),
          ),
        ],
      ),
    );
    final reason = c.text.trim();
    c.dispose();
    if (ok != true) return;
    if (reason.isEmpty) {
      if (mounted) snack(context, t('reason_needed'));
      return;
    }
    try {
      await db.from('orders').update({'status': 'cancelled', 'cancel_reason': reason}).eq('id', id);
      await _load();
    } catch (e) {
      if (mounted) snack(context, friendlyError(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Text(_error!),
          const SizedBox(height: 12),
          FilledButton(style: FilledButton.styleFrom(minimumSize: const Size(160, 48)), onPressed: _load, child: Text(t('retry'))),
        ]),
      );
    }
    if (_orders.isEmpty) return Center(child: Text(t('no_orders'), style: const TextStyle(fontSize: 18)));

    return RefreshIndicator(
      onRefresh: _load,
      child: LayoutBuilder(builder: (context, box) {
        final cols = box.maxWidth >= 1100 ? 3 : (box.maxWidth >= 700 ? 2 : 1);
        const gap = 10.0;
        const pad = 12.0;
        final cardW = (box.maxWidth - pad * 2 - gap * (cols - 1)) / cols;
        return ListView(
          padding: const EdgeInsets.all(pad),
          children: [
            for (final s in _sections.keys)
              if (_orders.any((o) => o['status'] == s)) ...[
                Padding(
                  padding: const EdgeInsets.fromLTRB(4, 12, 4, 6),
                  child: Text(t(_sections[s]!), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                ),
                Wrap(
                  spacing: gap,
                  runSpacing: gap,
                  children: [
                    for (final o in _orders.where((o) => o['status'] == s)) SizedBox(width: cardW, child: _card(o)),
                  ],
                ),
              ],
            const SizedBox(height: 24),
          ],
        );
      }),
    );
  }

  Widget _card(Map<String, dynamic> o) {
    final role = widget.profile.role;
    final status = o['status'] as String;
    final items = List<Map<String, dynamic>>.from(o['order_items'] ?? []);
    final step = _flow[status];
    final canMove = step != null && step.$3.contains(role);
    final canCancel = status != 'served' && (role == 'owner' || role == 'manager');
    final bills = o['bills'];
    final hasBill = bills is List ? bills.isNotEmpty : bills != null;
    final canBill = status == 'served' && widget.profile.canTakeOrders;

    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Text('${t('table')} ${o['table_no']}', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
            const Spacer(),
            if (o['source'] == 'qr') const Chip(label: Text('QR'), visualDensity: VisualDensity.compact),
          ]),
          const SizedBox(height: 6),
          for (final i in items)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 2),
              child: Text(
                '${i['qty']} x ${i['menu_items']?['name'] ?? '?'}${(i['note'] ?? '').toString().isEmpty ? '' : '  (${i['note']})'}',
                style: const TextStyle(fontSize: 17),
              ),
            ),
          if (canMove) ...[
            const SizedBox(height: 12),
            FilledButton(onPressed: () => _move(o['id'] as String, step!.$2), child: Text(t(step!.$1))),
          ],
          if (canBill) ...[
            const SizedBox(height: 12),
            FilledButton(
              onPressed: () async {
                await showBill(context, o['id'] as String);
                _load();
              },
              child: Text(hasBill ? t('bill') : t('act_bill')),
            ),
          ],
          if (canCancel) ...[
            const SizedBox(height: 6),
            TextButton(onPressed: () => _cancel(o['id'] as String), child: Text(t('act_cancel'), style: const TextStyle(color: Colors.red))),
          ],
        ]),
      ),
    );
  }
}
