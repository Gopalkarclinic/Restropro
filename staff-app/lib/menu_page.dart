import 'package:flutter/material.dart';
import 'profile.dart';
import 'strings.dart';
import 'widgets.dart';

/// Everyone can hide / show an item (one tap). Owner and manager can also add items and change prices.
class MenuPage extends StatefulWidget {
  final Profile profile;
  const MenuPage({super.key, required this.profile});
  @override
  State<MenuPage> createState() => _MenuPageState();
}

class _MenuPageState extends State<MenuPage> {
  List<Map<String, dynamic>> _items = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final rows = await db
          .from('menu_items')
          .select('id, name, price_paise, is_available')
          .eq('restaurant_id', widget.profile.restaurantId)
          .order('name');
      if (!mounted) return;
      setState(() {
        _items = List<Map<String, dynamic>>.from(rows);
        _loading = false;
        _error = null;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = t('check_net');
      });
    }
  }

  Future<void> _toggle(Map<String, dynamic> it, bool value) async {
    final old = it['is_available'];
    setState(() => it['is_available'] = value); // instant feedback
    try {
      await db.from('menu_items').update({'is_available': value}).eq('id', it['id']);
    } catch (e) {
      if (!mounted) return;
      setState(() => it['is_available'] = old);
      snack(context, friendlyError(e));
    }
  }

  Future<void> _edit([Map<String, dynamic>? it]) async {
    final name = TextEditingController(text: it?['name'] as String? ?? '');
    final price = TextEditingController(text: it == null ? '' : ((it['price_paise'] as int) / 100).toString().replaceAll(RegExp(r'\.0$'), ''));
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(it == null ? t('add_item') : t('edit_item')),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: name, decoration: InputDecoration(labelText: t('name')), textCapitalization: TextCapitalization.words),
          const SizedBox(height: 8),
          TextField(controller: price, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: InputDecoration(labelText: t('price_rs'))),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(t('cancel'))),
          FilledButton(
            style: FilledButton.styleFrom(minimumSize: const Size(100, 44)),
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(t('save')),
          ),
        ],
      ),
    );
    final n = name.text.trim();
    final rupees = double.tryParse(price.text.trim());
    name.dispose();
    price.dispose();
    if (ok != true || n.isEmpty || rupees == null || rupees < 0) return;
    final paise = (rupees * 100).round();
    try {
      if (it == null) {
        await db.from('menu_items').insert({'restaurant_id': widget.profile.restaurantId, 'name': n, 'price_paise': paise});
      } else {
        await db.from('menu_items').update({'name': n, 'price_paise': paise}).eq('id', it['id']);
      }
      await _load();
    } catch (e) {
      if (mounted) snack(context, friendlyError(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final canEdit = widget.profile.canManageMenu;
    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: canEdit ? FloatingActionButton.extended(onPressed: _edit, icon: const Icon(Icons.add), label: Text(t('add_item'))) : null,
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!))
              : RefreshIndicator(
                  onRefresh: _load,
                  child: Centered(
                    maxWidth: 800,
                    child: ListView.builder(
                      padding: const EdgeInsets.fromLTRB(12, 12, 12, 96),
                      itemCount: _items.length,
                      itemBuilder: (_, i) {
                        final it = _items[i];
                        final on = it['is_available'] == true;
                        return Card(
                          child: ListTile(
                            onTap: canEdit ? () => _edit(it) : null,
                            title: Text(it['name'] as String, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: on ? null : Colors.grey)),
                            subtitle: Text(on ? rs(it['price_paise'] as int) : '${rs(it['price_paise'] as int)}  -  ${t('sold_out')}'),
                            trailing: Switch(value: on, onChanged: (v) => _toggle(it, v)),
                          ),
                        );
                      },
                    ),
                  ),
                ),
    );
  }
}
