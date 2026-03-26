import shutil
from pathlib import Path

from django.conf import settings
from django.db import migrations


OLD_PREFIX = "documents/"
NEW_PREFIX = "uploaded_documents/"


def rename_document_paths(apps, schema_editor):
    Document = apps.get_model("documents", "Document")
    media_root = Path(settings.MEDIA_ROOT)
    backend_root = Path(getattr(settings, "BACKEND_DIR", Path(settings.BASE_DIR).parent))

    for document in Document.objects.exclude(file=""):
        current_name = document.file.name

        if not current_name.startswith(OLD_PREFIX):
            continue

        new_name = f"{NEW_PREFIX}{current_name[len(OLD_PREFIX):]}"
        current_candidates = [
            media_root / current_name,
            backend_root / current_name,
            Path(settings.BASE_DIR) / current_name,
        ]
        new_path = media_root / new_name
        new_path.parent.mkdir(parents=True, exist_ok=True)

        existing_source = next((path for path in current_candidates if path.exists()), None)

        if existing_source and not new_path.exists():
            shutil.move(str(existing_source), str(new_path))

        document.file = new_name
        document.save(update_fields=["file"])


class Migration(migrations.Migration):

    dependencies = [
        ("documents", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(
            rename_document_paths,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
