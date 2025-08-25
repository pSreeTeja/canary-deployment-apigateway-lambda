import json, os

def handler(event, context):
    return {
        "statusCode": 200,
        "body": json.dumps({
            "message": "Hello from Lambda!",
            "alias": os.getenv("AWS_LAMBDA_FUNCTION_ALIAS", "unknown")
        })
    }
