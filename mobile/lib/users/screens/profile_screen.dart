import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart' show AppTheme, Breakpoints;
import '../models/user_model.dart';
import '../../core/widgets/adaptive_dialogs.dart';
import '../../core/widgets/brand_logo.dart';
import '../providers/auth_provider.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final _formKey = GlobalKey<FormState>();
  late TextEditingController _nameCtrl;
  late TextEditingController _emailCtrl;
  late TextEditingController _phoneCtrl;
  bool _initialized = false;

  /// false = read-only profile summary (avatar, name, email, Edit Profile,
  /// Log Out) — the state shown after a successful save. true = edit form.
  bool _editing = false;

  void _syncControllers(UserModel? user) {
    _nameCtrl.text = user?.name ?? '';
    _emailCtrl.text = user?.email ?? '';
    _phoneCtrl.text = user?.phone ?? '';
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_initialized) {
      final user = context.read<AuthProvider>().user;
      _nameCtrl = TextEditingController(text: user?.name ?? '');
      _emailCtrl = TextEditingController(text: user?.email ?? '');
      _phoneCtrl = TextEditingController(text: user?.phone ?? '');
      // Start in edit mode only when required details are still missing.
      _editing = !(user?.isProfileComplete ?? false);
      _initialized = true;
    }
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _emailCtrl.dispose();
    _phoneCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) {
      _toast('Please fix the highlighted fields.', Colors.red);
      return;
    }
    final auth = context.read<AuthProvider>();
    final ok = await auth.updateProfile(
      name: _nameCtrl.text.trim(),
      email: _emailCtrl.text.trim(),
      phone: _phoneCtrl.text.replaceAll(RegExp(r'[^0-9]'), ''),
    );
    if (!mounted) return;
    if (ok) {
      _syncControllers(auth.user);
      setState(() => _editing = false);
      _toast('Profile updated and synced.', Colors.green);
    } else {
      _toast(auth.error ?? 'Could not sync your profile.', Colors.red);
    }
  }

  void _toast(String message, Color color) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message), backgroundColor: color));
  }

  InputDecoration _fieldDecoration(
    String label,
    TextEditingController controller,
  ) {
    final color = controller.text.trim().isEmpty ? Colors.amber : Colors.green;
    final border = OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: BorderSide(color: color, width: 1.5),
    );
    return InputDecoration(
      labelText: label,
      enabledBorder: border,
      focusedBorder: border,
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: Colors.red, width: 2),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: Colors.red, width: 2),
      ),
    );
  }

  Future<void> _logout() async {
    final confirmed = await showAdaptiveConfirm(
      context,
      title: 'Log out',
      message: 'Are you sure you want to log out?',
      confirm: 'Log out',
      isDestructive: true,
    );
    if (confirmed != true || !mounted) return;
    await context.read<AuthProvider>().logout();
    if (mounted) context.go('/login');
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final user = auth.user;

    return Scaffold(
      appBar: AppBar(title: const BrandLogo(size: 32)),
      body: Center(
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxWidth: Breakpoints.formMaxWidth(
              MediaQuery.sizeOf(context).width,
            ),
          ),
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: !_editing
                ? _buildSummary(context, auth, user)
                : _buildForm(auth, user),
          ),
        ),
      ),
    );
  }

  /// Read-only profile view shown after a successful save: avatar, name,
  /// email, and the two actions from the design — Edit Profile + Log Out.
  Widget _buildSummary(
    BuildContext context,
    AuthProvider auth,
    UserModel? user,
  ) {
    return Column(
      children: [
        CircleAvatar(
          radius: 56,
          backgroundImage: _profileImage(user?.profilePic),
          child: user?.profilePic == null
              ? const Icon(Icons.person, size: 48)
              : null,
        ),
        const SizedBox(height: 16),
        Text(
          user?.name ?? '',
          style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 4),
        Text(
          user?.email ?? '',
          style: const TextStyle(color: AppTheme.textMuted),
          textAlign: TextAlign.center,
        ),
        if (user?.customId != null) ...[
          const SizedBox(height: 6),
          Text(user!.customId!, style: const TextStyle(color: Colors.grey)),
        ],
        const SizedBox(height: 28),
        SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.success,
              foregroundColor: Colors.white,
            ),
            onPressed: () {
              _syncControllers(auth.user);
              setState(() => _editing = true);
            },
            child: const Text('Edit Profile'),
          ),
        ),
        const SizedBox(height: 12),
        SizedBox(
          width: double.infinity,
          child: OutlinedButton(
            onPressed: auth.isLoading ? null : _logout,
            style: OutlinedButton.styleFrom(
              foregroundColor: Colors.red,
              side: const BorderSide(color: Colors.red),
            ),
            child: const Text('Log Out'),
          ),
        ),
      ],
    );
  }

  Widget _buildForm(AuthProvider auth, UserModel? user) {
    return Form(
      key: _formKey,
      child: Column(
        children: [
          CircleAvatar(
            radius: 44,
            backgroundImage: _profileImage(user?.profilePic),
            child: user?.profilePic == null
                ? const Icon(Icons.person, size: 40)
                : null,
          ),
          if (user?.customId != null) ...[
            const SizedBox(height: 8),
            Text(user!.customId!, style: const TextStyle(color: Colors.grey)),
          ],
          const SizedBox(height: 24),
          TextFormField(
            controller: _nameCtrl,
            decoration: _fieldDecoration('Full Name *', _nameCtrl),
            autovalidateMode: AutovalidateMode.onUserInteraction,
            onChanged: (_) => setState(() {}),
            validator: (v) {
              final value = v?.trim() ?? '';
              if (value.isEmpty) return 'Required';
              if (value.length < 2) return 'Enter your full name';
              return null;
            },
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: _emailCtrl,
            keyboardType: TextInputType.emailAddress,
            decoration: _fieldDecoration('Email *', _emailCtrl),
            autovalidateMode: AutovalidateMode.onUserInteraction,
            onChanged: (_) => setState(() {}),
            validator: (v) {
              if (v == null || v.trim().isEmpty) return 'Required';
              if (!RegExp(r'^[^@]+@[^@]+\.[^@]+').hasMatch(v.trim())) {
                return 'Invalid email';
              }
              return null;
            },
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: _phoneCtrl,
            keyboardType: TextInputType.phone,
            decoration: _fieldDecoration('Phone *', _phoneCtrl),
            autovalidateMode: AutovalidateMode.onUserInteraction,
            onChanged: (_) => setState(() {}),
            validator: (v) {
              final value = v?.trim() ?? '';
              if (value.isEmpty) return 'Required';
              final digits = value.replaceAll(RegExp(r'[^0-9]'), '');
              if (digits.length < 10 || digits.length > 11) {
                return 'Invalid phone number';
              }
              return null;
            },
          ),
          const SizedBox(height: 28),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: auth.isLoading ? null : _save,
              child: auth.isLoading
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Text('Save Changes'),
            ),
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton(
              onPressed: auth.isLoading
                  ? null
                  : () => setState(() => _editing = false),
              child: const Text('Cancel'),
            ),
          ),
        ],
      ),
    );
  }
}

ImageProvider? _profileImage(String? pic) {
  if (pic == null || pic.isEmpty) return null;
  final url = pic.startsWith('http') ? pic : ApiClient().absoluteUrl(pic);
  return url.isEmpty ? null : NetworkImage(url);
}
