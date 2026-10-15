import secrets
import string


def generate_email_verification_code():
    alphabet = string.ascii_uppercase + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(6))


def generate_invitation_code():
    return secrets.token_urlsafe(24)
