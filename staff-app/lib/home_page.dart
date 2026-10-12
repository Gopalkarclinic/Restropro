import 'dart:async';
import 'package:flutter/material.dart';
import 'menu_page.dart';
import 'new_order_page.dart';
import 'offline_queue.dart';
import 'orders_page.dart';
import 'profile.dart';
import 'strings.dart';
import 'widgets.dart';

class HomePage extends StatefulWidget {
  const HomePage({super.key});
  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  Profile? _profile;
  bool _loading = true;
  bool _error = false;
  int _index = 0;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _load();
    OfflineQueue.init().then((_) => OfflineQueue.flush());
    // keep trying to send orders that were saved while offline
    _timer = Timer.periodic(const Duration(seconds: 20), (_) => OfflineQueue.flush());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = false;
    });
    try {
      final p = await loadProfile();
      if (!mounted) return;
      setState(() {
        _profile = p;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = true;
      });
    }
  }

  List<_Tab> _tabs(Profile p) {
    return [
      _Tab(t('orders'), Icons.receipt_long, OrdersPage(profile: p)),
      if (p.canTakeOrders) _Tab(t('new_order'), Icons.add_circle_outline, NewOrderPage(profile: p)),
      _Tab(t('menu'), Icons.restaurant_menu, MenuPage(profile: p)),
    ];
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    final p = _profile;
    if (_error || p == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Restropro'), actions: [
          const LanguageButton(),
          IconButton(icon: const Icon(Icons.logout), tooltip: t('logout'), onPressed: () => db.auth.signOut()),
        ]),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Text(_error ? t('check_net') : t('no_restaurant'), textAlign: TextAlign.center),
              const SizedBox(height: 16),
              FilledButton(onPressed: _load, child: Text(t('retry'))),
            ]),
          ),
        ),
      );
    }

    final tabs = _tabs(p);
    if (_index >= tabs.length) _index = 0;
    final wide = MediaQuery.of(context).size.width >= 800;

    final appBar = AppBar(
      title: Text(p.restaurantName.isEmpty ? 'Restropro' : p.restaurantName),
      actions: [
        ValueListenableBuilder<int>(
          valueListenable: OfflineQueue.count,
          builder: (_, n, __) => n == 0
              ? const SizedBox.shrink()
              : Center(
                  child: Container(
                    margin: const EdgeInsets.only(right: 8),
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(color: const Color(0xFFE0A100), borderRadius: BorderRadius.circular(12)),
                    child: Text('$n ${t('pending_queue')}', style: const TextStyle(color: Colors.black, fontSize: 12, fontWeight: FontWeight.w700)),
                  ),
                ),
        ),
        const LanguageButton(),
        IconButton(icon: const Icon(Icons.logout), tooltip: t('logout'), onPressed: () => db.auth.signOut()),
      ],
    );

    // IndexedStack keeps each tab alive (cart / scroll are not lost when switching).
    final body = IndexedStack(index: _index, children: [for (final tab in tabs) tab.page]);

    if (wide) {
      return Scaffold(
        appBar: appBar,
        body: Row(children: [
          NavigationRail(
            selectedIndex: _index,
            onDestinationSelected: (i) => setState(() => _index = i),
            labelType: NavigationRailLabelType.all,
            destinations: [for (final tab in tabs) NavigationRailDestination(icon: Icon(tab.icon), label: Text(tab.label))],
          ),
          const VerticalDivider(width: 1),
          Expanded(child: body),
        ]),
      );
    }
    return Scaffold(
      appBar: appBar,
      body: body,
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: [for (final tab in tabs) NavigationDestination(icon: Icon(tab.icon), label: tab.label)],
      ),
    );
  }
}

class _Tab {
  final String label;
  final IconData icon;
  final Widget page;
  _Tab(this.label, this.icon, this.page);
}
