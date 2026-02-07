import os
from superset.config import *
from datetime import timedelta

SUPERSET_ENV = os.getenv("SUPERSET_ENV", "production")
APP_NAME = "BitWobbly Superset"
APP_ICON = "/static/assets/images/superset-logo-horiz.png"
DEFAULT_TIMEZONE = "Europe/London"
SUPERSET_WEBSERVER_ADDRESS = '0.0.0.0'
SUPERSET_WEBSERVER_PORT = 9000
SECRET_KEY = os.getenv("SUPERSET_SECRET_KEY")

SQLALCHEMY_DATABASE_URI = os.getenv(
    "DATABASE_URL",
    f"postgresql+psycopg2://{os.getenv('DATABASE_USER', 'superset')}:{os.getenv('DATABASE_PASSWORD', 'superset')}@{os.getenv('DATABASE_HOST', 'postgres')}:{os.getenv('DATABASE_PORT', '5432')}/{os.getenv('DATABASE_DB', 'superset')}"
)

CACHE_CONFIG = {
    "CACHE_TYPE": "RedisCache",
    "CACHE_DEFAULT_TIMEOUT": 300,
    "CACHE_KEY_PREFIX": "superset_",
    "CACHE_REDIS_URL": f"redis://{os.getenv('REDIS_HOST', 'valkey')}:6379/0",
}

FEATURE_FLAGS = {
    "ALERT_REPORTS": False,
    "DASHBOARD_NATIVE_FILTERS": True,
    "DASHBOARD_CROSS_FILTERS": True,
    "EMBEDDABLE_CHARTS": True,
}
HTTP_HEADERS = {'X-Frame-Options': 'ALLOWALL'}
SQLLAB_DEFAULT_TIMEOUT = 600
SQLLAB_CTAS_NO_LIMIT = True

ENABLE_CORS = True
CORS_OPTIONS = {
    "origins": "*",
    "supports_credentials": True,
    'allow_headers': ['*'],
    'resources': ['*'],
}

ENABLE_PROXY_FIX = True
WTF_CSRF_ENABLED = False
PUBLIC_ROLE_LIKE = "Gamma"
SUPERSET_WEBSERVER_DOMAINS = ['superset.bitwobbly.com']
TALISMAN_ENABLED=False
PERMANENT_SESSION_LIFETIME = timedelta(hours=4)
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SECURE = False

LOG_LEVEL = "ERROR"
SEND_ANONYMOUS_USAGE_STATS = False

ROW_LIMIT = 10000
SQL_MAX_ROW = 100000

ESTIMATE_QUERY_COST = True

UPLOAD_FOLDER ="/opt/superset/uploads"

D3_FORMAT = {
    "decimal": ",",
    "thousands": ".",
    "currency": ["€", ""],
    "grouping": [3],
}
