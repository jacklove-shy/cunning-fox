-- 004 错题本：拍下/抄录错题，按三栏法（错解/正解/反思）归档，间隔复习捡回分数
CREATE TABLE IF NOT EXISTS qingbei_wrong_questions (
  id              VARCHAR(40)   PRIMARY KEY,
  owner           VARCHAR(40)   NOT NULL,
  subject         VARCHAR(20)   NOT NULL,
  knowledge_points JSON          NULL,
  question        TEXT           NULL,
  my_answer       TEXT           NULL,
  correct_answer  TEXT           NULL,
  reason          VARCHAR(10)   DEFAULT '其他',
  reflection      TEXT           NULL,
  difficulty      TINYINT        DEFAULT 3,
  review_count    INT            DEFAULT 0,
  next_review_at  DATE           NULL,
  created_at      DATETIME       DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_wq_owner_subject   (owner, subject),
  INDEX idx_wq_owner_due       (owner, next_review_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
