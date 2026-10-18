-- auth 域表结构（MySQL 8.0.16+ 方言，InnoDB + utf8mb4）
-- 与 SQLite 版一一对应；ISO 时间串仍用 VARCHAR 存，避开驱动层时区转换的坑
-- 约束全部落在库里（PK/FK/CHECK/索引），不止靠应用层自觉——企业做法

CREATE TABLE IF NOT EXISTS users (
  username   VARCHAR(20)  NOT NULL COMMENT '登录名（字母/数字/中文，2-20 字符）',
  role       VARCHAR(10)  NOT NULL DEFAULT 'user' COMMENT 'admin=全权限 / user=读+礼账CRUD',
  salt       VARCHAR(64)  NOT NULL COMMENT 'scrypt 盐（hex）',
  hash       VARCHAR(128) NOT NULL COMMENT 'scrypt 哈希（hex，64 字节）',
  pv         INT          NOT NULL DEFAULT 0 COMMENT '密码版本号：改密 +1，旧 Token 随之作废',
  created_at VARCHAR(32)  NOT NULL COMMENT 'ISO 时间串',
  PRIMARY KEY (username),
  CONSTRAINT chk_users_role CHECK (role IN ('admin', 'user'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sessions (
  jti        VARCHAR(18)   NOT NULL COMMENT '会话 ID = Token payload 里的 jti',
  username   VARCHAR(20)   NOT NULL,
  role       VARCHAR(10)   NOT NULL DEFAULT 'user',
  pv         INT           NOT NULL DEFAULT 0,
  iat        INT UNSIGNED  NOT NULL COMMENT '签发时间（unix 秒）',
  exp        INT UNSIGNED  NOT NULL COMMENT '过期时间（unix 秒，2038 年前 INT 够用）',
  created_at VARCHAR(32)   NOT NULL,
  revoked    TINYINT       NOT NULL DEFAULT 0 COMMENT '0=有效 1=已撤销（改密/单会话踢出）',
  PRIMARY KEY (jti),
  CONSTRAINT fk_sessions_user FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE,
  INDEX idx_sessions_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS auth_meta (
  k VARCHAR(64) NOT NULL COMMENT '配置键（如 hmac_secret）',
  v TEXT        NOT NULL COMMENT '配置值',
  PRIMARY KEY (k)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
