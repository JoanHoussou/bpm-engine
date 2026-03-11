import nodemailer from 'nodemailer';
import { getSmtpConfig } from '../../services/SettingsService.js';

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || '';

let transporter: nodemailer.Transporter | null = null;

async function getTransporter() {
  if (transporter) return transporter;
  
  const smtp = await getSmtpConfig();
  
  if (!smtp.configured) {
    console.log('[Notification] SMTP not configured');
    return null;
  }
  
  transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: smtp.user ? {
      user: smtp.user,
      pass: smtp.pass,
    } : undefined,
  });
  
  console.log('[Notification] SMTP transporter created for:', smtp.host);
  return transporter;
}

export async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  const smtp = await getSmtpConfig();
  
  if (!smtp.configured) {
    console.log('[Notification] SMTP not configured, skipping email');
    return false;
  }
  
  const transport = await getTransporter();
  if (!transport) return false;
  
  try {
    await transport.sendMail({
      from: smtp.from,
      to,
      subject,
      text,
    });
    console.log('[Notification] Email sent to:', to);
    return true;
  } catch (error) {
    console.error('[Notification] Failed to send email:', error);
    return false;
  }
}

export type TemplateType = 
  | 'approval-request'
  | 'workflow-completed'
  | 'workflow-failed'
  | 'reminder'
  | 'escalation';

interface TemplateData {
  executionId?: string;
  type?: string;
  actor?: string;
  actionUrl?: string;
  status?: string;
  error?: string;
  stepName?: string;
}

const templates: Record<TemplateType, (data: TemplateData) => { subject: string; text: string }> = {
  'approval-request': (data) => ({
    subject: `Action Required: ${data.type} workflow`,
    text: `A workflow "${data.type}" requires your approval.\n\nExecution ID: ${data.executionId}\nPlease review and take action: ${data.actionUrl}`,
  }),
  'workflow-completed': (data) => ({
    subject: `Workflow Completed: ${data.type}`,
    text: `Your workflow "${data.type}" has completed successfully.\n\nExecution ID: ${data.executionId}\nStatus: ${data.status}`,
  }),
  'workflow-failed': (data) => ({
    subject: `Workflow Failed: ${data.type}`,
    text: `Your workflow "${data.type}" has failed.\n\nExecution ID: ${data.executionId}\nError: ${data.error}\nStep: ${data.stepName}`,
  }),
  'reminder': (data) => ({
    subject: `Reminder: Action required for ${data.type}`,
    text: `This is a reminder that your approval is still pending.\n\nExecution ID: ${data.executionId}\nPlease review: ${data.actionUrl}`,
  }),
  'escalation': (data) => {
    const originalActor = data.actor || 'Unknown';
    return {
      subject: `Escalation: ${data.type} requires your attention`,
      text: `A workflow "${data.type}" has been escalated to you.\n\nOriginal approver: ${originalActor}\nExecution ID: ${data.executionId}\nPlease review: ${data.actionUrl}`,
    };
  },
};

class NotificationServiceClass {
  async sendEmail(
    to: string,
    template: TemplateType,
    data: TemplateData
  ): Promise<void> {
    const smtp = await getSmtpConfig();
    
    if (!smtp.configured) {
      console.log(`[NotificationService] SMTP not configured, skipping email to ${to}`);
      return;
    }

    try {
      const { subject, text } = templates[template](data);
      const transport = await getTransporter();
      
      if (!transport) return;

      await transport.sendMail({
        from: smtp.from,
        to,
        subject,
        text,
      });

      console.log(`[NotificationService] Email sent to ${to}: ${subject}`);
    } catch (error) {
      console.error(`[NotificationService] Failed to send email to ${to}:`, error);
    }
  }

  async sendSlack(message: string): Promise<void> {
    if (!SLACK_WEBHOOK_URL) {
      console.log('[NotificationService] Slack webhook not configured, skipping');
      return;
    }

    try {
      const response = await fetch(SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: message }),
      });

      if (!response.ok) {
        throw new Error(`Slack API returned ${response.status}`);
      }

      console.log('[NotificationService] Slack message sent');
    } catch (error) {
      console.error('[NotificationService] Failed to send Slack message:', error);
    }
  }

  async notifyWorkflowCompleted(
    to: string,
    executionId: string,
    type: string
  ): Promise<void> {
    await Promise.allSettled([
      this.sendEmail(to, 'workflow-completed', {
        executionId,
        type,
        status: 'COMPLETED',
      }),
      this.sendSlack(`✅ Workflow "${type}" (${executionId}) completed`),
    ]);
  }

  async notifyWorkflowFailed(
    to: string,
    executionId: string,
    type: string,
    error: string,
    stepName?: string
  ): Promise<void> {
    await Promise.allSettled([
      this.sendEmail(to, 'workflow-failed', {
        executionId,
        type,
        error,
        stepName,
      }),
      this.sendSlack(`❌ Workflow "${type}" (${executionId}) failed: ${error}`),
    ]);
  }

  async notifyApprovalRequest(
    to: string,
    executionId: string,
    type: string,
    actionUrl: string
  ): Promise<void> {
    await Promise.allSettled([
      this.sendEmail(to, 'approval-request', {
        executionId,
        type,
        actionUrl,
      }),
      this.sendSlack(`🔔 Approval required for "${type}" (${executionId})`),
    ]);
  }

  async notifyReminder(
    to: string,
    executionId: string,
    type: string,
    actionUrl: string
  ): Promise<void> {
    await Promise.allSettled([
      this.sendEmail(to, 'reminder', {
        executionId,
        type,
        actionUrl,
      }),
      this.sendSlack(`⏰ Reminder: Approval pending for "${type}" (${executionId})`),
    ]);
  }

  async notifyEscalation(
    to: string,
    executionId: string,
    type: string,
    originalActor: string,
    actionUrl: string
  ): Promise<void> {
    await Promise.allSettled([
      this.sendEmail(to, 'escalation', {
        executionId,
        type,
        actor: originalActor,
        actionUrl,
      }),
      this.sendSlack(`⚠️ Escalated: "${type}" (${executionId}) escalated to ${to}`),
    ]);
  }
}

export const NotificationService = new NotificationServiceClass();
