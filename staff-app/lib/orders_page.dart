import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

final _db = Supabase.instance.client;

// status -> (label, next status, which roles may move it)
const _flow = <String, (String, String, Set<String>)>{
  'pending_approval': ('Approve karo', 'approved', {'owner', 'manager', 'captain'}),
  'approved': ('Banana shuru', 'preparing', {'owner', 'manager', 'kitchen'}),
  'preparing': ('Ready hai', 'ready', {'owner', 'manager', 'kitchen'}),
  'ready': ('Serve ho gaya', 'served', {'owner', 'manager', 'captain'}),
};

const _title = {
  'pending_approval': 'Naye (approve karne hain)',
  'approved': 'Approved',
  'preparing': 'Ban raha hai',
  'ready': 'Ready - serve karo',
};

class OrdersPage extends StatefulWidget {
  const OrdersPage({super.key});
  @override
  State<OrdersPage> createState() => _OrdersPageState();
}

class _OrdersPageState extends State<OrdersPage> {
  List<Map<String, dynamic>> _orders = [];
  String _role = '';
  String _restaurant = '';
  bool _loading = true;
  String? _error;
  RealtimeChannel? _channel;

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    try {
      final me = await _db
          .from('staff')
          .select('role, restaurants(name)')
          .eq('user_id', _db.auth.currentUser!.id)
          .limit(1)
          .maybeSingle();
      if (me == null) {
        setState(() { _loading = false; _error = 'Is account ko kisi restaurant se jodna baaki hai. Owner se bolo.'; });
        return;
      }
      _role = me['role'] as String;
      _restaurant = (me['restaurants']?['name'] ?? '') as String;
      await _load();
      // live updates; RLS makes sure we only get our own restaurant's changes
      _channel = _db
          .channel('orders-live')
          .onPostgresChanges(event: PostgresChangeEvent.all, schema: 'public', table: 'orders', callback: (_) => _load())
          .subscribe();
    } catch (_) {
      setState(() { _loading = false; _error = 'Load nahi ho paya. Internet check karo.'; });
    }
  }

  Future<void> _load() async {
    final rows = await _db
        .from('orders')
        .select('id, table_no, status, source, created_at, order_items(qty, note, menu_items(name))')
        .inFilter('status', ['pending_approval', 'approved', 'preparing', 'ready'])
        .order('created_at');
    if (!mounted) return;
    setState(() { _orders = List<Map<String, dynamic>>.from(rows); _loading = false; _error = null; });
  }

  Future<void> _move(String id, String next) async {
    try {
      await _db.from('orders').update({'status': next}).eq('id', id);
      await _load();
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Nahi ho paya, phir try karo')));
    }
  }

  @override
  void dispose() {
    _channel?.unsubscribe();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_restaurant.isEmpty ? 'Orders' : '$_restaurant - Orders'),
        actions: [
          IconButton(tooltip: 'Logout', icon: const Icon(Icons.logout), onPressed: () => _db.auth.signOut()),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(_error!, textAlign: TextAlign.center)))
              : _orders.isEmpty
                  ? const Center(child: Text('Abhi koi order nahi'))
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView(
                        padding: const EdgeInsets.all(12),
                        children: [
                          for (final status in _title.keys) ...[
                            if (_orders.any((o) => o['status'] == status)) ...[
                              Padding(
                                padding: const EdgeInsets.fromLTRB(4, 12, 4, 6),
                                child: Text(_title[status]!, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                              ),
                              for (final o in _orders.where((o) => o['status'] == status)) _card(o),
                            ],
                          ],
                        ],
                      ),
                    ),
    );
  }

  Widget _card(Map<String, dynamic> o) {
    final items = List<Map<String, dynamic>>.from(o['order_items'] ?? []);
    final step = _flow[o['status']];
    final canMove = step != null && step.$3.contains(_role);
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Text('Table ${o['table_no']}', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
              const Spacer(),
              if (o['source'] == 'qr')
                const Chip(label: Text('QR'), visualDensity: VisualDensity.compact),
            ]),
            const SizedBox(height: 6),
            for (final i in items)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 2),
                child: Text('${i['qty']} x ${i['menu_items']?['name'] ?? '?'}${(i['note'] ?? '').toString().isEmpty ? '' : '  (${i['note']})'}', style: const TextStyle(fontSize: 17)),
              ),
            if (canMove) ...[
              const SizedBox(height: 12),
              FilledButton(onPressed: () => _move(o['id'] as String, step.$2), child: Text(step.$1)),
            ],
          ],
        ),
      ),
    );
  }
}
