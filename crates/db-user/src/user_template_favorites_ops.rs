use super::UserDatabase;

impl UserDatabase {
    pub async fn add_template_favorite(
        &self,
        user_id: String,
        template_id: String,
    ) -> Result<(), crate::Error> {
        let conn = self.conn()?;

        conn.execute(
            "INSERT OR IGNORE INTO user_template_favorites (
                user_id,
                template_id
            ) VALUES (
                :user_id,
                :template_id
            )",
            libsql::named_params! {
                ":user_id": user_id,
                ":template_id": template_id,
            },
        )
        .await?;

        Ok(())
    }

    pub async fn remove_template_favorite(
        &self,
        user_id: String,
        template_id: String,
    ) -> Result<(), crate::Error> {
        let conn = self.conn()?;

        conn.execute(
            "DELETE FROM user_template_favorites 
             WHERE user_id = :user_id AND template_id = :template_id",
            libsql::named_params! {
                ":user_id": user_id,
                ":template_id": template_id,
            },
        )
        .await?;

        Ok(())
    }

    pub async fn list_user_favorite_templates(
        &self,
        user_id: String,
    ) -> Result<Vec<String>, crate::Error> {
        let conn = self.conn()?;

        let mut rows = conn
            .query(
                "SELECT template_id FROM user_template_favorites 
                 WHERE user_id = :user_id 
                 ORDER BY created_at DESC",
                libsql::named_params! {
                    ":user_id": user_id,
                },
            )
            .await?;

        let mut template_ids = Vec::new();
        while let Some(row) = rows.next().await.unwrap() {
            let template_id: String = row.get(0).expect("template_id");
            template_ids.push(template_id);
        }

        Ok(template_ids)
    }

    pub async fn is_template_favorited(
        &self,
        user_id: String,
        template_id: String,
    ) -> Result<bool, crate::Error> {
        let conn = self.conn()?;

        let mut rows = conn
            .query(
                "SELECT COUNT(*) FROM user_template_favorites 
                 WHERE user_id = :user_id AND template_id = :template_id",
                libsql::named_params! {
                    ":user_id": user_id,
                    ":template_id": template_id,
                },
            )
            .await?;

        if let Some(row) = rows.next().await.unwrap() {
            let count: i64 = row.get(0).expect("count");
            Ok(count > 0)
        } else {
            Ok(false)
        }
    }

    pub async fn cleanup_template_favorites(
        &self,
        template_id: String,
    ) -> Result<(), crate::Error> {
        let conn = self.conn()?;

        conn.execute(
            "DELETE FROM user_template_favorites WHERE template_id = :template_id",
            libsql::named_params! {
                ":template_id": template_id,
            },
        )
        .await?;

        Ok(())
    }
}
