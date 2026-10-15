import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import os
import base64
import logging

class EmailService:
    def __init__(self):
        self.sender = os.getenv("SENDER_EMAIL")
        self.sender_password = os.getenv("SENDER_PASSWORD")

    def _send(self, to, message):
        """Open a fresh SMTP connection per email so a dropped connection never breaks sending."""
        with smtplib.SMTP('smtp.gmail.com', 587, timeout=15) as session:
            session.starttls()
            session.login(self.sender, self.sender_password)
            session.sendmail(self.sender, to, message.as_string())

    def get_base64_encoded_image(self, image_path):
        try:
            with open(image_path, "rb") as img_file:
                return base64.b64encode(img_file.read()).decode('utf-8')
        except Exception as e:
            logging.getLogger(__name__).warning("Error reading logo: %s", e)
            return ""

    def send_code_verification(self, to, code):
        message = MIMEMultipart()
        message['From'] = self.sender
        message['To'] = to
        message['Subject'] = 'Verification code - eMonitoringAI'
        
        logo_path = os.path.join(os.path.dirname(__file__), '..', 'static', 'logo', 'Logo_Vision.webp')
        logo_base64 = self.get_base64_encoded_image(logo_path)
        logo_tag = f'<img style="float: right; width: 50px; height: 50px; object-fit: cover;" src="data:image/webp;base64,{logo_base64}"/>'
        message_body_html = f"""
            <html>
            <head>
            </head>
            <body style="font-family: Arial, sans-serif; background-color: #f4f4f4;">
                <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);">
                    {logo_tag}
                    <h2 style="color: #333;">Confirm your email address</h2>     
                    <p style="color: #555;
                            line-height: 1.6;">There’s one quick step you need to complete
                        before creating your account.
                        Let’s make sure this is the right email address for you
                        — please confirm this is the right address to use
                            for your new account.</p>
                    <p style="color: #555;
                            line-height: 1.6;">Please enter this verification code to get started:</p>
                    <b><p style="color: #555;
                            line-height: 1.6;">{code}</p></b>
                    <p style="color: #555;
                            line-height: 1.6;">Verification codes expire after five minutes.</p>
                    <p style="color: #555;
                            line-height: 1.6;">Thanks,<br>
                    sVISION Team</p>
                    
                    <p style="color: #888;
                            font-size: 12px; text-align:center;">sVISION, Bucharest</p>
                </div>
                
            </html>
        """
        
        message.attach(MIMEText(message_body_html, 'html'))
        try:
            self._send(to, message)
            return True
        except Exception as e:
            logging.getLogger(__name__).error("Could not send verification email to %s: %s", to, e)
            return False

emailService = None
def get_email_service():
    global emailService
    if emailService == None:
        emailService = EmailService()
    return emailService
