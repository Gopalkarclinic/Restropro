# Staff app (Flutter)

First time setup (once):
```
cd staff-app
flutter create . --platforms=android,web --org in.restropro --project-name restropro_staff
flutter pub get
```
Run (the public key is already in dart_defines.json - it is safe, it is NOT the secret key):
```
flutter run -d chrome --dart-define-from-file=dart_defines.json
```
`flutter create .` will not overwrite lib/ or pubspec.yaml's dependencies.
