import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});
  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _email = TextEditingController();
  final _pass = TextEditingController();
  bool _busy = false;
  String? _error;

  Future<void> _login() async {
    setState(() { _busy = true; _error = null; });
    try {
      await Supabase.instance.client.auth.signInWithPassword(email: _email.text.trim(), password: _pass.text);
    } on AuthException {
      setState(() => _error = 'Email ya password galat hai');
    } catch (_) {
      setState(() => _error = 'Internet check karo, phir try karo');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: ListView(
              padding: const EdgeInsets.all(24),
              shrinkWrap: true,
              children: [
                const Text('Restropro', style: TextStyle(fontSize: 36, fontWeight: FontWeight.w800, color: Color(0xFF6B1E1E))),
                const SizedBox(height: 4),
                const Text('Staff login'),
                const SizedBox(height: 32),
                TextField(controller: _email, keyboardType: TextInputType.emailAddress, autofillHints: const [AutofillHints.email], decoration: const InputDecoration(labelText: 'Email', border: OutlineInputBorder())),
                const SizedBox(height: 16),
                TextField(controller: _pass, obscureText: true, autofillHints: const [AutofillHints.password], onSubmitted: (_) => _login(), decoration: const InputDecoration(labelText: 'Password', border: OutlineInputBorder())),
                if (_error != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(_error!, style: const TextStyle(color: Colors.red))),
                const SizedBox(height: 24),
                FilledButton(onPressed: _busy ? null : _login, child: Text(_busy ? 'Ruko...' : 'Login')),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
