import { Resend } from 'resend';

interface SendInviteEmailParams {
  to: string;
  token: string;
  inviteUrl: string;
}

export async function sendInviteEmail({ to, token, inviteUrl }: SendInviteEmailParams) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('Missing env var: RESEND_API_KEY');

  const resend = new Resend(apiKey);

  const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:600px;width:100%;">
          <tr>
            <td style="background:#16222E;padding:32px 40px;text-align:center;">
              <span style="font-size:28px;font-weight:bold;color:#ffffff;">wapy</span>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <h1 style="margin:0 0 16px;font-size:24px;color:#16222E;">¡Estás invitado a Wapy!</h1>
              <p style="margin:0 0 24px;font-size:16px;color:#555555;line-height:1.6;">
                Recibiste una invitación para crear tu tienda online en Wapy. Con Wapy podés armar tu catálogo de productos y recibir pedidos directo por WhatsApp.
              </p>
              <p style="margin:0 0 32px;font-size:16px;color:#555555;line-height:1.6;">
                Hacé clic en el botón de abajo para activar tu cuenta. Este enlace es válido por 7 días.
              </p>
              <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
                <tr>
                  <td align="center" style="border-radius:50px;background:#F5C84B;">
                    <a href="${inviteUrl}" style="display:inline-block;padding:16px 32px;font-size:16px;font-weight:800;color:#16222E;text-decoration:none;border-radius:50px;">
                      Crear mi tienda gratis
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:32px 0 0;font-size:13px;color:#999999;line-height:1.6;">
                Si el botón no funciona, copiá este enlace en tu navegador:<br>
                <a href="${inviteUrl}" style="color:#F5C84B;word-break:break-all;">${inviteUrl}</a>
              </p>
              <hr style="margin:32px 0;border:none;border-top:1px solid #eeeeee;">
              <p style="margin:0;font-size:13px;color:#cccccc;">
                Si no esperabas esta invitación, podés ignorar este email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

  const text = `¡Estás invitado a Wapy!

Recibiste una invitación para crear tu tienda online en Wapy.

Activá tu cuenta entrando al siguiente enlace:
${inviteUrl}

Este enlace es válido por 7 días. Si no esperabas esta invitación, ignorá este email.

— El equipo de Wapy`;

  const { data, error } = await resend.emails.send({
    from: 'Wapy <hola@wapy.com.ar>',
    to,
    subject: 'Tu invitación para crear tu tienda en Wapy',
    html,
    text,
  });

  if (error) throw new Error(`Resend error: ${error.message}`);

  return data;
}
