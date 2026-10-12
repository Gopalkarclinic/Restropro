# Staff app (Flutter) - owner / manager / captain / kitchen

Features: login, live orders with sound alert, captain order entry (works offline, auto-sends later),
kitchen flow, cancel with reason (owner/manager), GST bill (copy for WhatsApp), menu manager (hide item in one tap),
Hindi / Marathi / English, phone + laptop layouts.

## First time (once)
```
cd staff-app
flutter create . --platforms=android,web --org in.restropro --project-name restropro_staff
flutter pub get
```
## Run
```
flutter run -d chrome --dart-define-from-file=dart_defines.json
```
(`dart_defines.json` has only the public key - safe. Never put the service_role key anywhere here.)

## Build
Android APK: `flutter build apk --dart-define-from-file=dart_defines.json`
Web (laptop): `flutter build web --dart-define-from-file=dart_defines.json` -> upload `build/web` to any static host.

## Test accounts (demo project)
See your own notes; create staff in Supabase Auth, then link with `docs/create-first-owner.sql`.
