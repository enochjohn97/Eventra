import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'core/theme/app_theme.dart';
import 'core/network/api_client.dart';
import 'clients/routing/client_router.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  
  // Initialize Core Services
  ApiClient();

  runApp(
    MultiProvider(
      providers: [
        Provider(create: (_) => () {}), // Placeholder for future state management
      ],
      child: const ClientApp(),
    ),
  );
}

class ClientApp extends StatelessWidget {
  const ClientApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'Eventra Organizer',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.lightTheme,
      routerConfig: clientRouter,
    );
  }
}
