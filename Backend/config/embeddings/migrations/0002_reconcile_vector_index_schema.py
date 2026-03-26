from django.db import migrations


def reconcile_vector_index_column(apps, schema_editor):
    if schema_editor.connection.vendor != "sqlite":
        return

    with schema_editor.connection.cursor() as cursor:
        cursor.execute("PRAGMA table_info('embeddings_embedding')")
        columns = {row[1] for row in cursor.fetchall()}

        if "vector_index" in columns:
            return

        if "vector_id" in columns:
            cursor.execute(
                "ALTER TABLE embeddings_embedding "
                "ADD COLUMN vector_index integer"
            )
            cursor.execute(
                """
                UPDATE embeddings_embedding
                SET vector_index = CASE
                    WHEN trim(COALESCE(vector_id, '')) GLOB '[0-9]*'
                        THEN CAST(vector_id AS integer)
                    ELSE id - 1
                END
                WHERE vector_index IS NULL
                """
            )
            return

        cursor.execute(
            "ALTER TABLE embeddings_embedding "
            "ADD COLUMN vector_index integer DEFAULT 0"
        )


class Migration(migrations.Migration):

    dependencies = [
        ("embeddings", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(
            reconcile_vector_index_column,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
