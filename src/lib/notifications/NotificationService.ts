import { z } from 'zod';

/**
 * Comprehensive Notification Service
 * Handles email, SMS, push notifications, and WhatsApp
 */

export const NotificationSchema = z.object({
  channel: z.enum(['email', 'sms', 'push', 'whatsapp']),
  recipient: z.string(),
  subject: z.string().optional(),
  message: z.string(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  metadata: z.record(z.any()).optional()
});

export type Notification = z.infer<typeof NotificationSchema>;

export class NotificationService {
  /**
   * Send email notification
   */
  async sendEmail(to: string, subject: string, body: string, html?: string): Promise<boolean> {
    try {
      console.log(`[EMAIL] To: ${to}, Subject: ${subject}`);

      // In production, integrate with SendGrid, AWS SES, or Resend
      // await sendgridClient.send({
      //   to,
      //   from: 'contact@hampsteadrenovations.co.uk',
      //   subject,
      //   text: body,
      //   html: html || body
      // });

      return true;
    } catch (error) {
      console.error('Email send error:', error);
      return false;
    }
  }

  /**
   * Send SMS notification
   */
  async sendSMS(to: string, message: string): Promise<boolean> {
    try {
      console.log(`[SMS] To: ${to}, Message: ${message.substring(0, 50)}...`);

      // In production, integrate with Twilio or AWS SNS
      // await twilioClient.messages.create({
      //   to,
      //   from: process.env.TWILIO_PHONE_NUMBER,
      //   body: message
      // });

      return true;
    } catch (error) {
      console.error('SMS send error:', error);
      return false;
    }
  }

  /**
   * Send push notification
   */
  async sendPush(userId: string, title: string, body: string, data?: Record<string, any>): Promise<boolean> {
    try {
      console.log(`[PUSH] User: ${userId}, Title: ${title}`);

      // In production, integrate with Firebase Cloud Messaging or OneSignal
      // await fcm.send({
      //   token: userDeviceToken,
      //   notification: { title, body },
      //   data
      // });

      return true;
    } catch (error) {
      console.error('Push notification error:', error);
      return false;
    }
  }

  /**
   * Send WhatsApp message
   */
  async sendWhatsApp(to: string, message: string): Promise<boolean> {
    try {
      console.log(`[WHATSAPP] To: ${to}, Message: ${message.substring(0, 50)}...`);

      // In production, integrate with Twilio WhatsApp API
      // await twilioClient.messages.create({
      //   to: `whatsapp:${to}`,
      //   from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
      //   body: message
      // });

      return true;
    } catch (error) {
      console.error('WhatsApp send error:', error);
      return false;
    }
  }

  /**
   * Send emergency notification (all channels)
   */
  async sendEmergencyNotification(
    customer: { email: string; phone: string },
    emergency: { type: string; callId: string; eta: string; contractorName: string; contractorPhone: string }
  ): Promise<void> {
    // SMS (immediate)
    await this.sendSMS(
      customer.phone,
      `🚨 EMERGENCY RESPONSE: ${emergency.type}\n` +
      `Call ID: ${emergency.callId}\n` +
      `${emergency.contractorName} will arrive in ${emergency.eta}\n` +
      `Contractor: ${emergency.contractorPhone}\n` +
      `Track status: hampsteadrenovations.co.uk/emergency/${emergency.callId}`
    );

    // Email (detailed)
    await this.sendEmail(
      customer.email,
      `🚨 Emergency Response Dispatched - ${emergency.callId}`,
      `Your emergency has been received and a qualified engineer has been dispatched.\n\n` +
      `Emergency Type: ${emergency.type}\n` +
      `Reference: ${emergency.callId}\n` +
      `Estimated Arrival: ${emergency.eta}\n` +
      `Engineer: ${emergency.contractorName}\n` +
      `Contact: ${emergency.contractorPhone}\n\n` +
      `Track your emergency response in real-time:\n` +
      `https://hampsteadrenovations.co.uk/emergency/${emergency.callId}\n\n` +
      `For urgent queries, call: 07459 345456`
    );
  }

  /**
   * Send renovation quote notification
   */
  async sendQuoteNotification(
    customer: { email: string; phone: string; name: string },
    quote: { projectId: string; amount: number; validUntil: string }
  ): Promise<void> {
    await this.sendEmail(
      customer.email,
      `Your Renovation Quote - £${quote.amount.toLocaleString()}`,
      `Dear ${customer.name},\n\n` +
      `Thank you for your renovation enquiry. We're pleased to provide you with a detailed quote.\n\n` +
      `Quote Amount: £${quote.amount.toLocaleString()} (inc VAT)\n` +
      `Valid Until: ${new Date(quote.validUntil).toLocaleDateString()}\n` +
      `Project Reference: ${quote.projectId}\n\n` +
      `View your detailed quote and breakdown:\n` +
      `https://hampsteadrenovations.co.uk/renovations/quote/${quote.projectId}\n\n` +
      `To accept this quote or discuss further, please contact us:\n` +
      `Phone: 07459 345456\n` +
      `Email: contact@hampsteadrenovations.co.uk\n\n` +
      `Best regards,\n` +
      `Hampstead Renovations Team`
    );

    await this.sendSMS(
      customer.phone,
      `Your renovation quote is ready! £${quote.amount.toLocaleString()} - ` +
      `View details: hampsteadrenovations.co.uk/renovations/quote/${quote.projectId}`
    );
  }

  /**
   * Send maintenance reminder
   */
  async sendMaintenanceReminder(
    customer: { email: string; phone: string; name: string },
    maintenance: { jobId: string; scheduledDate: string; jobType: string; address: string }
  ): Promise<void> {
    const date = new Date(maintenance.scheduledDate);
    const formattedDate = date.toLocaleDateString('en-GB', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    const formattedTime = date.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit'
    });

    await this.sendSMS(
      customer.phone,
      `Reminder: ${maintenance.jobType} scheduled for ${formattedDate} at ${formattedTime}. ` +
      `Location: ${maintenance.address}. Job ID: ${maintenance.jobId}`
    );

    await this.sendEmail(
      customer.email,
      `Maintenance Appointment Reminder - ${formattedDate}`,
      `Dear ${customer.name},\n\n` +
      `This is a reminder of your upcoming maintenance appointment:\n\n` +
      `Service: ${maintenance.jobType}\n` +
      `Date: ${formattedDate}\n` +
      `Time: ${formattedTime}\n` +
      `Location: ${maintenance.address}\n` +
      `Job Reference: ${maintenance.jobId}\n\n` +
      `Our engineer will arrive within the scheduled time window. ` +
      `Please ensure someone over 18 is present to provide access.\n\n` +
      `Need to reschedule? Contact us:\n` +
      `Phone: 07459 345456\n` +
      `Email: contact@hampsteadrenovations.co.uk\n\n` +
      `Best regards,\n` +
      `Hampstead Renovations Team`
    );
  }

  /**
   * Send review request
   */
  async sendReviewRequest(
    customer: { email: string; name: string },
    project: { id: string; type: string; completedDate: string }
  ): Promise<void> {
    await this.sendEmail(
      customer.email,
      `How was your experience with Hampstead Renovations?`,
      `Dear ${customer.name},\n\n` +
      `Thank you for choosing Hampstead Renovations for your ${project.type}.\n\n` +
      `We hope you're delighted with the results! We'd love to hear about your experience.\n\n` +
      `Could you spare 2 minutes to leave us a review?\n` +
      `https://hampsteadrenovations.co.uk/reviews/submit?project=${project.id}\n\n` +
      `Your feedback helps us improve our service and helps other homeowners in North West London ` +
      `make informed decisions about their renovation projects.\n\n` +
      `As a thank you, you'll receive 500 loyalty points (worth £50 off your next project) ` +
      `when you submit your review.\n\n` +
      `Best regards,\n` +
      `Hampstead Renovations Team\n\n` +
      `P.S. If you weren't completely satisfied, please reply to this email so we can make it right.`
    );
  }

  /**
   * Send contractor dispatch notification
   */
  async notifyContractor(
    contractor: { id: string; name: string; phone: string; email: string },
    job: { id: string; type: string; address: string; postcode: string; urgency: string; customerPhone: string }
  ): Promise<void> {
    await this.sendSMS(
      contractor.phone,
      `NEW JOB ASSIGNED (${job.urgency.toUpperCase()})\n` +
      `Type: ${job.type}\n` +
      `Location: ${job.address}, ${job.postcode}\n` +
      `Customer: ${job.customerPhone}\n` +
      `Job ID: ${job.id}\n` +
      `View details: hampsteadrenovations.co.uk/contractors/jobs/${job.id}`
    );

    await this.sendEmail(
      contractor.email,
      `New Job Assignment - ${job.type} (${job.urgency})`,
      `Hi ${contractor.name},\n\n` +
      `You have been assigned a new ${job.urgency} priority job.\n\n` +
      `Job Details:\n` +
      `Type: ${job.type}\n` +
      `Address: ${job.address}\n` +
      `Postcode: ${job.postcode}\n` +
      `Customer Contact: ${job.customerPhone}\n` +
      `Job Reference: ${job.id}\n\n` +
      `Please confirm acceptance and update your ETA:\n` +
      `https://hampsteadrenovations.co.uk/contractors/jobs/${job.id}\n\n` +
      `For urgent queries: 07459 345456\n\n` +
      `Hampstead Renovations`
    );
  }
}

export default NotificationService;
