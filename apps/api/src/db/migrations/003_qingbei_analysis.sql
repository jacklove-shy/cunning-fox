-- 清北助手：试卷诊断（失分点分析）
-- qingbei_papers  一次考试（一科一张卷）
-- qingbei_loss_points 每道题的失分结构化数据（错因 + 知识点）
CREATE TABLE IF NOT EXISTS qingbei_papers (
  id         VARCHAR(40)  NOT NULL,
  owner      VARCHAR(40)  NOT NULL DEFAULT 'sister',
  subject    VARCHAR(20)  NOT NULL,
  exam_name  VARCHAR(60)  NOT NULL DEFAULT '',
  exam_date  DATE         NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_papers_owner (owner)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS qingbei_loss_points (
  id               VARCHAR(40)  NOT NULL,
  paper_id         VARCHAR(40)  NOT NULL,
  owner            VARCHAR(40)  NOT NULL DEFAULT 'sister',
  subject          VARCHAR(20)  NOT NULL,
  q_no             VARCHAR(20)  NOT NULL DEFAULT '',
  score            DECIMAL(6,2) NOT NULL DEFAULT 0,
  full_mark        DECIMAL(6,2) NOT NULL DEFAULT 0,
  is_correct       TINYINT(1)   NOT NULL DEFAULT 0,
  reason           VARCHAR(20)  NOT NULL DEFAULT '',
  knowledge_points JSON         NULL,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_lp_paper (paper_id),
  KEY idx_lp_owner (owner)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
