from django.db import migrations


def rebuild_embeddings_table(apps, schema_editor):
    if schema_editor.connection.vendor != "sqlite":
        return

    with schema_editor.connection.cursor() as cursor:
        cursor.execute("PRAGMA table_info('embeddings_embedding')")
        columns = {row[1] for row in cursor.fetchall()}

        if not columns or "vector_id" not in columns:
            return

        if "vector_index" in columns:
            vector_index_sql = """
                CASE
                    WHEN vector_index IS NOT NULL THEN vector_index
                    WHEN trim(COALESCE(vector_id, '')) GLOB '[0-9]*'
                        THEN CAST(vector_id AS integer)
                    ELSE id - 1
                END
            """
        else:
            vector_index_sql = """
                CASE
                    WHEN trim(COALESCE(vector_id, '')) GLOB '[0-9]*'
                        THEN CAST(vector_id AS integer)
                    ELSE id - 1
                END
            """

        cursor.execute("PRAGMA foreign_keys = OFF")
        cursor.execute(
            """
            CREATE TABLE "embeddings_embedding_new" (
                "id" integer NOT NULL PRIMARY KEY AUTOINCREMENT,
                "chunk_text" text NOT NULL,
                "vector_index" integer NOT NULL,
                "created_at" datetime NOT NULL,
                "document_id" bigint NOT NULL
                    REFERENCES "documents_document" ("id")
                    DEFERRABLE INITIALLY DEFERRED
            )
            """
        )
        cursor.execute(
            f"""
            INSERT INTO "embeddings_embedding_new"
                ("id", "chunk_text", "vector_index", "created_at", "document_id")
            SELECT
                "id",
                "chunk_text",
                {vector_index_sql},
                "created_at",
                "document_id"
            FROM "embeddings_embedding"
            """
        )
        cursor.execute('DROP TABLE "embeddings_embedding"')
        cursor.execute(
            'ALTER TABLE "embeddings_embedding_new" RENAME TO "embeddings_embedding"'
        )
        cursor.execute(
            """
            CREATE INDEX IF NOT EXISTS "embeddings_embedding_document_id_idx"
            ON "embeddings_embedding" ("document_id")
            """
        )
        cursor.execute("PRAGMA foreign_keys = ON")


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ("embeddings", "0002_reconcile_vector_index_schema"),
    ]

    operations = [
        migrations.RunPython(
            rebuild_embeddings_table,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
