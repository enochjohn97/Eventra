import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/event_utils.dart';
import '../models/event_model.dart';

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
    final imageUrl = event.absoluteImageUrl ??
        (event.imagePath != null ? ApiClient().absoluteUrl(event.imagePath) : '');

    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            AspectRatio(
              aspectRatio: 16 / 10,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  if (imageUrl.isNotEmpty)
                    CachedNetworkImage(
                      imageUrl: imageUrl,
                      fit: BoxFit.cover,
                      placeholder: (_, __) => Container(color: Colors.grey.shade200),
                      errorWidget: (_, __, ___) => _fallbackImage(),
                    )
                  else
                    _fallbackImage(),
                  if (event.priorityLabel != null && event.priorityLabel!.isNotEmpty)
                    Positioned(
                      top: 12,
                      left: 12,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(20),
                          boxShadow: const [BoxShadow(color: Colors.black12, blurRadius: 8)],
                        ),
                        child: Text(
                          event.priorityLabel!,
                          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
                        ),
                      ),
                    ),
                  if (onFavorite != null)
                    Positioned(
                      top: 8,
                      right: 8,
                      child: Material(
                        color: Colors.white.withValues(alpha: 0.92),
                        shape: const CircleBorder(),
                        child: IconButton(
                          icon: Icon(
                            event.isFavorite ? Icons.favorite : Icons.favorite_border,
                            color: event.isFavorite ? Colors.red : AppTheme.textMuted,
                          ),
                          onPressed: onFavorite,
                        ),
                      ),
                    ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (event.customId != null)
                    Text(
                      event.customId!,
                      style: const TextStyle(fontSize: 11, color: AppTheme.textMuted, fontWeight: FontWeight.w600),
                    ),
                  Text(
                    event.eventName,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppTheme.textMain),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      const Icon(Icons.calendar_today, size: 14, color: AppTheme.textMuted),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          EventUtils.formatDate(event.eventDate),
                          style: const TextStyle(fontSize: 13, color: AppTheme.textMuted),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      const Icon(Icons.location_on_outlined, size: 14, color: AppTheme.textMuted),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          EventUtils.venueLine(event),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 13, color: AppTheme.textMuted),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        EventUtils.formatPrice(event),
                        style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppTheme.primary),
                      ),
                      if (event.category != null)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: AppTheme.primary.withValues(alpha: 0.08),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(event.category!, style: const TextStyle(fontSize: 11, color: AppTheme.primary)),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _fallbackImage() {
    return Container(
      color: const Color(0xFFEDE9FE),
      child: const Center(child: Icon(Icons.event, size: 48, color: AppTheme.primary)),
    );
  }
}
