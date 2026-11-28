import os
from django.core.exceptions import ValidationError
from PIL import Image

MAX_UPLOAD_SIZE = 5 * 1024 * 1024  # 5 MB
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


def validar_imagem_upload(file):
    """
    Valida tamanho e formato real de imagens enviadas por upload.
    Evita arquivos maliciosos ou excessivamente pesados.
    """
    if file.size > MAX_UPLOAD_SIZE:
        raise ValidationError("O tamanho máximo permitido para imagens é de 5 MB.")

    ext = os.path.splitext(file.name)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValidationError(f"Formato '{ext}' não permitido. Use JPEG, PNG ou WebP.")

    # Validação do cabeçalho binário real da imagem com Pillow
    try:
        file.seek(0)
        img = Image.open(file)
        img.verify()
        file.seek(0)
    except Exception:
        raise ValidationError("O arquivo enviado não é uma imagem válida.")
