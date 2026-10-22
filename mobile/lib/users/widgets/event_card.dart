import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/event_utils.dart';
import '../models/event_model.dart';

/// Compact discovery card. Every visible value comes from the event returned
/// by the API; no ratings, amenities or placeholder venue details are invented.
class EventCard extends StatelessWidget {
  final EventModel event;
  final VoidCallback onTap;
  final VoidCallback? onFavorite;

  const EventCard({
    super.key,
    required this.event,
    required this.onTap,
    this.onFavorite,
  });

  @override
  Widget build(BuildContext context) {
    /// Prefer the server-supplied absolute URL when available so images resolve
    /// correctly regardless of which origin (local vs live) the app is using.
    /// Only fall back to rebuilding from [imagePath] when the server did not
    /// provide an absolute URL (older API responses).
    final imageUrl = event.absoluteImageUrl ??
        (event.imagePath != null && event.imagePath!.isNotEmpty
            ? ApiClient().absoluteUrl(event.imagePath)
            : '');
    final passed = EventUtils.isPassed(event);

    return Card(
      elevation: 0,
      margin: EdgeInsets.zero,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      child: InkWell(
        onTap: onTap,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SizedBox(
              width: 132,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  imageUrl.isEmpty
                      ? _fallbackImage()
                      : CachedNetworkImage(
                          imageUrl: imageUrl,
                          fit: BoxFit.cover,
                          placeholder: (_, _) => Container(color: Colors.grey.shade200),
                          errorWidget: (_, _, _) => _fallbackImage(),
                        ),
                  if (EventUtils.priorityBadge(event) != null)
                    Positioned(
                      top: 9,
                      left: 9,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 4),
                        decoration: BoxDecoration(
                          color: AppTheme.primary,
                          borderRadius: BorderRadius.circular(7),
                        ),
                        child: Text(
                          EventUtils.priorityBadge(event)!,
                          style: const TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.w800),
                        ),
                      ),
                    ),
                ],
              ),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(14, 11, 10, 11),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Text(
                            event.eventName,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w800, height: 1.15),
                          ),
                        ),
                        if (onFavorite != null)
                          IconButton(
                            padding: EdgeInsets.zero,
                            constraints: const BoxConstraints.tightFor(width: 28, height: 28),
                            iconSize: 19,
                            onPressed: onFavorite,
                            icon: Icon(event.isFavorite ? Icons.favorite : Icons.favorite_border,
                                color: event.isFavorite ? Colors.red : AppTheme.textMuted),
                          ),
                      ],
                    ),
                    const SizedBox(height: 5),
                    Text(
                      EventUtils.venueLine(event),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: AppTheme.textMuted, fontSize: 11.5),
                    ),
                    if (event.organizerName != null && event.organizerName!.trim().isNotEmpty) ...[
                      const SizedBox(height: 3),
                      Text(
                        event.organizerName!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: AppTheme.textMuted, fontSize: 10.5),
                      ),
                    ],
                    const SizedBox(height: 6),
                    Wrap(
                      spacing: 7,
                      runSpacing: 4,
                      children: [
                        _detail(Icons.calendar_today_outlined, EventUtils.formatDate(event.eventDate)),
                        if (event.eventTime != null && event.eventTime!.isNotEmpty)
                          _detail(Icons.schedule_outlined, event.eventTime!.substring(0, event.eventTime!.length < 5 ? event.eventTime!.length : 5)),
                        if (event.category != null && event.category!.isNotEmpty)
                          _detail(Icons.sell_outlined, event.category!),
                      ],
                    ),
                    const Spacer(),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            EventUtils.formatPrice(event),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800,
                                color: EventUtils.isFree(event) ? AppTheme.success : AppTheme.primary),
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
                          decoration: BoxDecoration(color: passed ? Colors.grey.shade200 : AppTheme.primary,
                              borderRadius: BorderRadius.circular(10)),
                          child: Text(passed ? 'Ended' : 'View details',
                              style: TextStyle(color: passed ? AppTheme.textMuted : Colors.white,
                                  fontSize: 11, fontWeight: FontWeight.w700)),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _detail(IconData icon, String text) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: AppTheme.textMuted),
          const SizedBox(width: 3),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 110),
            child: Text(text, maxLines: 1, overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: AppTheme.textMuted, fontSize: 10.5)),
          ),
        ],
      );

  Widget _fallbackImage() => Container(
        color: const Color(0xFFEDE9FE),
        alignment: Alignment.center,
        child: const Icon(Icons.event, size: 38, color: AppTheme.primary),
      );
}
