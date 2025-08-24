import json
import datetime
import os

def handler(event, context):
    return {
        "statusCode": 200,
        "body": json.dumps({
            "ok": True,
            "msg": f"Team Conrad Canary - at {datetime.datetime.utcnow().isoformat()}",
            "stage": os.environ.get("STAGE")
        }),
        "headers": {"content-type": "application/json"}
    }