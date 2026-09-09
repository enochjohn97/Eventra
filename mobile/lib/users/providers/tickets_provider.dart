import 'package:flutter/foundation.dart';
import '../models/ticket_model.dart';
import '../services/user_ticket_service.dart';

class TicketsProvider extends ChangeNotifier {
  List<TicketModel> tickets = [];
  bool isLoading = false;
  String? error;

  Future<void> load() async {
    isLoading = true;
    error = null;
    notifyListeners();
    try {
      tickets = await UserTicketService.getTickets();
    } catch (e) {
      error = e.toString().replaceFirst('Exception: ', '');
    } finally {
      isLoading = false;
      notifyListeners();
    }
  }

  Future<void> resendEmail(TicketModel ticket) async {
    await UserTicketService.sendTicketEmail(
      reference: ticket.reference,
      barcode: ticket.barcode,
      ticketId: ticket.id,
    );
  }
}
