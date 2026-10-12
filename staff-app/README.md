# Staff app (Flutter)

First time setup (once):
```
cd staff-app
flutter create . --platforms=android,web --org in.restropro --project-name restropro_staff
flutter pub get
```
Run (keys: Supabase dashboard -> Project Settings -> API; use the anon/publishable key only):
```
flutter run -d chrome --dart-define=SUPABASE_URL=https://eurxcepvxjpigbbbczyz.supabase.co --dart-define=SUPABASE_ANON_KEY=<anon key>
```
`flutter create .` will not overwrite lib/ or pubspec.yaml's dependencies.
