import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/event_utils.dart';
import '../models/event_model.dart';
import '../providers/app_config_provider.dart';
import '../providers/auth_provider.dart';
import '../providers/events_provider.dart';
import '../services/user_event_service.dart';

Future<void> showEventDetailSheet(
  BuildContext context, {
  required EventModel event,
  VoidCallback? onGetTicket,
}) async {
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: Colors.transparent,
    builder: (ctx) => _EventDetailSheet(event: event, onGetTicket: onGetTicket),
  );
}

class _EventDetailSheet extends StatefulWidget {
  final EventModel event;
  final VoidCallback? onGetTicket;

  const _EventDetailSheet({required this.event, this.onGetTicket});

  @override
  State<_EventDetailSheet> createState() => _EventDetailSheetState();
}

class _EventDetailSheetState extends State<_EventDetailSheet> {
  late EventModel _event;
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    _event = widget.event;
    _refreshDetails();
  }

  Future<void> _refreshDetails() async {
    setState(() => _loading = true);
    try {
      final fresh = await UserEventService.fetchEventDetails(_event.id);
      setState(() => _event = fresh.copyWith(isFavorite: _event.isFavorite));
    } catch (_) {}
    if (mounted) setState(() => _loading = false);
  }

  String get _imageUrl {
    if (_event.absoluteImageUrl != null && _event.absoluteImageUrl!.startsWith('http')) {
      return _event.absoluteImageUrl!;
    }
    if (_event.imagePath != null) {
      return ApiClient().absoluteUrl(_event.imagePath);
    }
    return '';
  }

  Future<void> _toggleFavorite() async {
    final auth = context.read<AuthProvider>();
    if (auth.status != AuthStatus.authenticated) {
      Navigator.pop(context);
      return;
    }
    try {
      final isFav = await context.read<EventsProvider>().toggleFavorite(_event);
      setState(() => _event = _event.copyWith(isFavorite: isFav));
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
      }
    }
  }

  Future<void> _share() async {
    final config = context.read<AppConfigProvider>();
    final link = '${config.appUrl}/public/pages/event-details.html?id=${_event.id}';
    await SharePlus.instance.share(ShareParams(text: 'Check out ${_event.eventName} on Eventra!\n$link'));
  }

  Future<void> _openMaps() async {
    final config = context.read<AppConfigProvider>();
    final query = Uri.encodeComponent(EventUtils.mapsQuery(_event));
    final url = Uri.parse(
      'https://www.google.com/maps/search/?api=1&query=$query&key=${config.mapsApiKey}',
    );
    if (await canLaunchUrl(url)) {
      await launchUrl(url, mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.88,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      builder: (_, controller) {
        return Container(
          decoration: const BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
          ),
          child: ListView(
            controller: controller,
            padding: EdgeInsets.zero,
            children: [
              Stack(
                children: [
                  SizedBox(
                    height: 240,
                    width: double.infinity,
                    child: _imageUrl.isNotEmpty
                        ? CachedNetworkImage(imageUrl: _imageUrl, fit: BoxFit.cover)
                        : Container(color: const Color(0xFFEDE9FE)),
                  ),
                  Positioned(
                    top: 12,
                    right: 12,
                    child: Row(
                      children: [
                        _circleBtn(Icons.share_outlined, _share),
                        const SizedBox(width: 8),
                        _circleBtn(
                          _event.isFavorite ? Icons.favorite : Icons.favorite_border,
                          _toggleFavorite,
                          color: _event.isFavorite ? Colors.red : null,
                        ),
                        const SizedBox(width: 8),
                        _circleBtn(Icons.close, () => Navigator.pop(context)),
                      ],
                    ),
                  ),
                ],
              ),
              Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (_event.customId != null)
                      Text(_event.customId!, style: const TextStyle(color: AppTheme.textMuted, fontWeight: FontWeight.w600)),
                    Text(
                      _event.eventName,
                      style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w800, color: AppTheme.textMain),
                    ),
                    if (_event.organizerName != null) ...[
                      const SizedBox(height: 8),
                      Text('Organized by ${_event.organizerName}', style: const TextStyle(color: AppTheme.textMuted)),
                    ],
                    const SizedBox(height: 20),
                    _infoTile(Icons.calendar_today, 'Date', EventUtils.formatDate(_event.eventDate)),
                    _infoTile(Icons.access_time, 'Time', EventUtils.formatTime(_event.eventTime)),
                    InkWell(
                      onTap: _openMaps,
                      borderRadius: BorderRadius.circular(12),
                      child: _infoTile(Icons.location_on_outlined, 'Venue', EventUtils.venueLine(_event), linkStyle: true),
                    ),
                    _infoTile(Icons.confirmation_number_outlined, 'Price', EventUtils.formatPrice(_event)),
                    if (_event.category != null)
                      _infoTile(Icons.category_outlined, 'Category', _event.category!),
                    const SizedBox(height: 16),
                    const Text('About', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                    const SizedBox(height: 8),
                    Text(
                      _event.description?.trim().isNotEmpty == true ? _event.description! : 'No description provided.',
                      style: const TextStyle(color: AppTheme.textMuted, height: 1.5),
                    ),
                    const SizedBox(height: 24),
                    if (_loading) const LinearProgressIndicator(minHeight: 2),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        onPressed: widget.onGetTicket,
                        child: const Text('Get Ticket'),
                      ),
                    ),
                    const SizedBox(height: 12),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _circleBtn(IconData icon, VoidCallback onTap, {Color? color}) {
    return Material(
      color: Colors.white.withValues(alpha: 0.95),
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(10),
          child: Icon(icon, color: color ?? AppTheme.textMain),
        ),
      ),
    );
  }

  Widget _infoTile(IconData icon, String label, String value, {bool linkStyle = false}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: AppTheme.primary.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, size: 20, color: AppTheme.primary),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label.toUpperCase(), style: const TextStyle(fontSize: 11, color: AppTheme.textMuted, fontWeight: FontWeight.w600)),
                Text(
                  value,
                  style: TextStyle(
                    fontWeight: FontWeight.w600,
                    color: linkStyle ? AppTheme.primary : AppTheme.textMain,
                    decoration: linkStyle ? TextDecoration.underline : null,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
