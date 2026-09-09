class TicketModel {
  final int id;
  final String? customId;
  final String barcode;
  final String ticketType;
  final String status;
  final bool used;
  final String? purchaseDate;
  final int eventId;
  final String? eventCustomId;
  final String eventName;
  final String? eventDate;
  final String? eventTime;
  final String? address;
  final String? location;
  final String? eventImage;
  final String? absoluteEventImage;
  final String? qrCodePath;
  final String? absoluteQrUrl;
  final double amount;
  final String? reference;
  final String? paymentStatus;
  final String? organizerName;

  const TicketModel({
    required this.id,
    this.customId,
    required this.barcode,
    this.ticketType = 'regular',
    this.status = 'valid',
    this.used = false,
    this.purchaseDate,
    required this.eventId,
    this.eventCustomId,
    required this.eventName,
    this.eventDate,
    this.eventTime,
    this.address,
    this.location,
    this.eventImage,
    this.absoluteEventImage,
    this.qrCodePath,
    this.absoluteQrUrl,
    this.amount = 0,
    this.reference,
    this.paymentStatus,
    this.organizerName,
  });

  factory TicketModel.fromJson(Map<String, dynamic> json, {String? baseOrigin}) {
    double toDouble(dynamic v) {
      if (v == null) return 0;
      if (v is num) return v.toDouble();
      return double.tryParse(v.toString()) ?? 0;
    }

    String? eventImage = json['event_image']?.toString();
    String? absEventImage = json['absolute_event_image']?.toString();
    if ((absEventImage == null || absEventImage.isEmpty) &&
        eventImage != null &&
        baseOrigin != null) {
      absEventImage = '$baseOrigin/${eventImage.replaceFirst(RegExp(r'^/'), '')}';
    }

    String? qrPath = json['qr_code_path']?.toString();
    String? absQr = json['absolute_qr_url']?.toString();
    if ((absQr == null || absQr.isEmpty) && qrPath != null && baseOrigin != null) {
      absQr = '$baseOrigin/${qrPath.replaceFirst(RegExp(r'^/'), '')}';
    }

    return TicketModel(
      id: int.tryParse(json['id']?.toString() ?? '') ?? 0,
      customId: json['custom_id']?.toString(),
      barcode: json['barcode']?.toString() ?? '',
      ticketType: json['ticket_type']?.toString() ?? 'regular',
      status: json['status']?.toString() ?? 'valid',
      used: json['used'] == true || json['used']?.toString() == '1',
      purchaseDate: json['purchase_date']?.toString(),
      eventId: int.tryParse(json['event_id']?.toString() ?? '') ?? 0,
      eventCustomId: json['event_custom_id']?.toString(),
      eventName: json['event_name']?.toString() ?? 'Event',
      eventDate: json['event_date']?.toString(),
      eventTime: json['event_time']?.toString(),
      address: json['address']?.toString(),
      location: json['location']?.toString(),
      eventImage: eventImage,
      absoluteEventImage: absEventImage,
      qrCodePath: qrPath,
      absoluteQrUrl: absQr,
      amount: toDouble(json['amount']),
      reference: json['reference']?.toString(),
      paymentStatus: json['payment_status']?.toString(),
      organizerName: json['organizer_name']?.toString(),
    );
  }
}
