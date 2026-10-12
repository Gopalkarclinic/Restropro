import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'login_page.dart';
import 'orders_page.dart';

// Passed at run time: --dart-define=SUPABASE_URL=... --dart-define=SUPABASE_ANON_KEY=...
// Only the ANON key goes here. Never the service_role key.
const _url = String.fromEnvironment('SUPABASE_URL');
const _anon = String.fromEnvironment('SUPABASE_ANON_KEY');

// Warm "dhaba" mood: turmeric + deep maroon on cream (not default blue Material).
const maroon = Color(0xFF6B1E1E);
const turmeric = Color(0xFFE0A100);
const cream = Color(0xFFFFF8EC);

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Supabase.initialize(url: _url, anonKey: _anon);
  runApp(const StaffApp());
}

class StaffApp extends StatelessWidget {
  const StaffApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Restropro Staff',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(seedColor: maroon, primary: maroon, secondary: turmeric),
        scaffoldBackgroundColor: cream,
        appBarTheme: const AppBarTheme(backgroundColor: maroon, foregroundColor: Colors.white),
        filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(56), textStyle: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
        ),
      ),
      home: StreamBuilder<AuthState>(
        stream: Supabase.instance.client.auth.onAuthStateChange,
        builder: (context, _) {
          final session = Supabase.instance.client.auth.currentSession;
          return session == null ? const LoginPage() : const OrdersPage();
        },
      ),
    );
  }
}
