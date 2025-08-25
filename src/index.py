import json
import os

def handler(event, context):
    # API Gateway uses stage variable to pick alias; alias name is visible via env var
    alias = os.getenv('AWS_LAMBDA_FUNCTION_ALIAS', 'unknown')
    body = {
        "message": "Hello from Lambda!",
        "alias": alias,
        "path": event.get("path"),
        "requestId": context.aws_request_id
    }
    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body)
    }
