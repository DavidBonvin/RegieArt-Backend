import { Injectable, Logger } from '@nestjs/common';

export interface InvitationEmailPayload {
  to: string;
  inviterName: string;
  orgName: string;
  orgLogoUrl?: string;
  role: string;
  instrument?: string;
  personalMessage?: string;
  inviteUrl: string;
  expiresAt: Date;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  private get apiKey(): string | undefined {
    return process.env.RESEND_API_KEY;
  }

  private get fromAddress(): string {
    return process.env.EMAIL_FROM ?? 'RegieArt <noreply@regieart.com>';
  }

  private get appUrl(): string {
    return process.env.APP_URL ?? 'http://localhost:3001';
  }

  async sendInvitationEmail(payload: InvitationEmailPayload): Promise<void> {
    const html = this.buildInvitationHtml(payload);

    if (!this.apiKey) {
      // Dev mode: log instead of sending
      this.logger.warn(
        `[EMAIL DEV] Invitation to ${payload.to} — ${payload.inviteUrl}`,
      );
      return;
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.fromAddress,
        to: [payload.to],
        subject: `${payload.inviterName} te invita a unirte a ${payload.orgName} en RegieArt`,
        html,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      this.logger.error(`Resend API error ${response.status}: ${body}`);
    }
  }

  private buildInvitationHtml(p: InvitationEmailPayload): string {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(p.inviteUrl)}&size=180x180&margin=10`;
    const expiryLabel = p.expiresAt.toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const roleLabels: Record<string, string> = {
      OWNER: 'Propietario',
      ADMIN: 'Administrador',
      MEMBER: 'Miembro',
      EXTERNAL_TECH: 'Técnico Externo',
    };
    const roleLabel = roleLabels[p.role] ?? p.role;

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Invitación a ${p.orgName}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);padding:32px 40px;text-align:center;">
            ${p.orgLogoUrl ? `<img src="${p.orgLogoUrl}" alt="${p.orgName}" style="height:48px;margin-bottom:16px;border-radius:8px;" />` : ''}
            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-.3px;">
              RegieArt
            </h1>
            <p style="margin:4px 0 0;color:#a0aec0;font-size:13px;">Gestión profesional para músicos</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:40px 40px 32px;">
            <h2 style="margin:0 0 8px;color:#1a202c;font-size:20px;font-weight:700;">
              ¡Te han invitado!
            </h2>
            <p style="margin:0 0 24px;color:#4a5568;font-size:15px;line-height:1.6;">
              <strong>${p.inviterName}</strong> te invita a unirte a la organización
              <strong>${p.orgName}</strong> en RegieArt.
            </p>

            <!-- Details card -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7fafc;border-radius:8px;margin-bottom:28px;">
              <tr><td style="padding:20px 24px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="color:#718096;font-size:12px;text-transform:uppercase;letter-spacing:.8px;padding-bottom:4px;">Organización</td>
                    <td style="color:#1a202c;font-size:15px;font-weight:600;text-align:right;">${p.orgName}</td>
                  </tr>
                  <tr>
                    <td style="color:#718096;font-size:12px;text-transform:uppercase;letter-spacing:.8px;padding:8px 0 4px;">Rol asignado</td>
                    <td style="color:#1a202c;font-size:15px;font-weight:600;text-align:right;">${roleLabel}</td>
                  </tr>
                  ${p.instrument ? `<tr>
                    <td style="color:#718096;font-size:12px;text-transform:uppercase;letter-spacing:.8px;padding:8px 0 4px;">Instrumento</td>
                    <td style="color:#1a202c;font-size:15px;font-weight:600;text-align:right;">${p.instrument}</td>
                  </tr>` : ''}
                  <tr>
                    <td style="color:#718096;font-size:12px;text-transform:uppercase;letter-spacing:.8px;padding:8px 0 0;">Expira el</td>
                    <td style="color:#e53e3e;font-size:13px;font-weight:600;text-align:right;">${expiryLabel}</td>
                  </tr>
                </table>
              </td></tr>
            </table>

            ${p.personalMessage ? `
            <!-- Personal message -->
            <table width="100%" cellpadding="0" cellspacing="0" style="border-left:3px solid #667eea;margin-bottom:28px;">
              <tr><td style="padding:4px 0 4px 16px;color:#4a5568;font-size:14px;font-style:italic;line-height:1.6;">
                "${p.personalMessage}"
              </td></tr>
            </table>` : ''}

            <!-- CTA button -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
              <tr><td align="center">
                <a href="${p.inviteUrl}" style="display:inline-block;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:8px;letter-spacing:-.2px;">
                  Aceptar invitación →
                </a>
              </td></tr>
            </table>

            <!-- QR section -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7fafc;border-radius:8px;margin-bottom:24px;">
              <tr><td style="padding:24px;text-align:center;">
                <p style="margin:0 0 16px;color:#4a5568;font-size:13px;">
                  ¿Tienes la app en el móvil? Escanea este QR directamente.
                </p>
                <img src="${qrUrl}" alt="QR de invitación" style="width:180px;height:180px;border-radius:8px;" />
              </td></tr>
            </table>

            <p style="margin:0;color:#a0aec0;font-size:12px;text-align:center;line-height:1.6;">
              Si no esperabas esta invitación, puedes ignorar este mensaje.<br />
              El enlace expirará el ${expiryLabel}.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f7fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center;">
            <p style="margin:0;color:#a0aec0;font-size:12px;">
              © ${new Date().getFullYear()} RegieArt · Gestión profesional para músicos
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
  }
}
