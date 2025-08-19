import json
import datetime
import os

def main(event, context):
    return {
        "statusCode": 200,
        "body": json.dumps({
            "ok": True,
            "msg": f"Hello from second NEW Release at {datetime.datetime.utcnow().isoformat()}",
            "stage": os.environ.get("STAGE")
        }),
        "headers": {"content-type": "application/json"}
    }