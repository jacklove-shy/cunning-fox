-- 清北成长助手：学习档案 + 目标拆解 + 月考记录
-- 单用户（妹妹）模型：profile / target 各一行（id 固定 'sister'），records 多行。
-- 迁移执行器会在事务中整文件执行，已应用过的迁移记录在 _migrations 表，不会重复跑。

CREATE TABLE IF NOT EXISTS qingbei_profile (
  id            VARCHAR(32) NOT NULL DEFAULT 'sister',
  name          VARCHAR(40) NOT NULL DEFAULT '妹妹',
  grade         VARCHAR(20) NOT NULL DEFAULT '高一',
  province      VARCHAR(20) NOT NULL DEFAULT '河北',
  city          VARCHAR(20) NOT NULL DEFAULT '廊坊',
  county        VARCHAR(20) NOT NULL DEFAULT '固安',
  target_school VARCHAR(60) NOT NULL DEFAULT '清华大学',
  target_major  VARCHAR(60) NOT NULL DEFAULT '计算机类',
  track         ENUM('物理','历史') NOT NULL DEFAULT '物理',
  electives     JSON        NOT NULL,
  exam_mode     VARCHAR(20) NOT NULL DEFAULT '3+1+2',
  gaokao_date   DATE        NOT NULL DEFAULT '2029-06-08',
  updated_at    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS qingbei_target (
  profile_id   VARCHAR(32) NOT NULL DEFAULT 'sister',
  total_target INT         NOT NULL DEFAULT 690,
  per_subject  JSON        NOT NULL,
  reference    JSON        NOT NULL,
  updated_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (profile_id),
  CONSTRAINT fk_qingbei_target_profile FOREIGN KEY (profile_id) REFERENCES qingbei_profile (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS qingbei_records (
  id          VARCHAR(40) NOT NULL,
  profile_id  VARCHAR(32) NOT NULL DEFAULT 'sister',
  subject     VARCHAR(20) NOT NULL,
  score       DECIMAL(6,2) NOT NULL,
  full_mark   DECIMAL(6,2) NOT NULL,
  exam_name   VARCHAR(60) NOT NULL DEFAULT '',
  exam_date   DATE        NOT NULL,
  created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_qingbei_records_profile_subject (profile_id, subject, exam_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 默认示例数据（用户可在界面手改；录取线为示例值，需以河北省教育考试院公布为准）
INSERT INTO qingbei_profile (id, name, grade, province, city, county, target_school, target_major, track, electives, exam_mode, gaokao_date)
VALUES ('sister', '妹妹', '高一', '河北', '廊坊', '固安', '清华大学', '计算机类', '物理',
        JSON_ARRAY('化学','生物'), '3+1+2', '2029-06-08')
ON DUPLICATE KEY UPDATE id = id;

INSERT INTO qingbei_target (profile_id, total_target, per_subject, reference)
VALUES ('sister', 690,
        JSON_OBJECT('语文',130,'数学',140,'英语',140,'物理',95,'化学',95,'生物',90),
        JSON_OBJECT(
          'school','清华/北大（河北·物理类）',
          'years', JSON_ARRAY(
            JSON_OBJECT('year',2024,'score',685,'rank',30),
            JSON_OBJECT('year',2023,'score',687,'rank',32),
            JSON_OBJECT('year',2022,'score',682,'rank',34)
          ),
          'note','示例值，请以河北省教育考试院公布为准'
        ))
ON DUPLICATE KEY UPDATE profile_id = profile_id;
