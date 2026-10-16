import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:webview_flutter/webview_flutter.dart';
import '../providers/app_config_provider.dart';

class PaymentWebViewScreen extends StatefulWidget {
  final String authorizationUrl;
  final String reference;

  const PaymentWebViewScreen({
    super.key,
    required this.authorizationUrl,
    required this.reference,
  });

  @override
  State<PaymentWebViewScreen> createState() => _PaymentWebViewScreenState();
}

class _PaymentWebViewScreenState extends State<PaymentWebViewScreen> {
  late final WebViewController _controller;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (_) => setState(() => _loading = true),
          onPageFinished: (_) => setState(() => _loading = false),
          onNavigationRequest: (request) {
            final url = request.url;
            if (url.contains('reference=') || url.contains('trxref=') || url.contains('payment.html')) {
              Future.microtask(() {
                if (mounted) Navigator.pop(context, true);
              });
              return NavigationDecision.prevent;
            }
            return NavigationDecision.navigate;
          },
        ),
      )
      ..loadRequest(Uri.parse(widget.authorizationUrl));
  }

  @override
  Widget build(BuildContext context) {
    final config = context.watch<AppConfigProvider>();
    final modeBanner = _buildModeBanner(config);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Paystack Checkout'),
        leading: IconButton(
          icon: const Icon(Icons.close),
          onPressed: () => Navigator.pop(context, false),
        ),
      ),
      body: Stack(
        children: [
          WebViewWidget(controller: _controller),
          if (_loading) const LinearProgressIndicator(minHeight: 3),
          if (modeBanner != null) Positioned.fill(
            child: Container(
              color: Colors.transparent,
              child: Align(
                alignment: Alignment.topCenter,
                child: Padding(
                  padding: const EdgeInsets.only(top: kToolbarHeight + 12),
                  child: modeBanner,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget? _buildModeBanner(AppConfigProvider config) {
    if (!config.isLoaded || config.paystackMode.isEmpty) return null;

    final isTest =
        config.paystackMode.toLowerCase() == 'test' || config.paystackIsTestMode;
    final isUnconfigured =
        config.paystackMode.toLowerCase() == 'unconfigured';

    if (isUnconfigured || !isTest) return null;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 12),
      decoration: BoxDecoration(
        color: const Color(0xFFF2F6FF),
        border: Border(
          bottom: BorderSide(
            color: const Color(0xFF0066FF).withValues(alpha: 0.18),
            width: 1,
          ),
        ),
      ),
      child: Row(
        children: [
          const Icon(
            Icons.warning_amber_rounded,
            size: 18,
            color: Color(0xFF0066FF),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'Paystack test key — payments here are test transactions, not live payments.',
              style: const TextStyle(
                color: Color(0xFF0066FF),
                fontSize: 12.5,
                height: 1.25,
              ),
              textAlign: TextAlign.center,
            ),
          ),
        ],
      ),
    );
  }
}

