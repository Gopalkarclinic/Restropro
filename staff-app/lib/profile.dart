import 'widgets.dart';

class Profile {
  final String role;
  final String restaurantId;
  final String restaurantName;
  const Profile(this.role, this.restaurantId, this.restaurantName);

  bool get canManageMenu => role == 'owner' || role == 'manager';
  bool get canTakeOrders => role == 'owner' || role == 'manager' || role == 'captain';
}

Future<Profile?> loadProfile() async {
  final me = await db
      .from('staff')
      .select('role, restaurant_id, restaurants(name)')
      .eq('user_id', db.auth.currentUser!.id)
      .limit(1)
      .maybeSingle();
  if (me == null) return null;
  final r = me['restaurants'];
  return Profile(
    me['role'] as String,
    me['restaurant_id'] as String,
    r is Map ? (r['name'] ?? '') as String : '',
  );
}
