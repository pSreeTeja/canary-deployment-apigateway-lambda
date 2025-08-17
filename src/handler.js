exports.handler = async(event) => {
    return {
        statusCode: 200,
        body: JSON.stringify({
            message: "hello from lambda. This is a poc for canary deployment",
            time: new Date().toISOString(), 
        })
    };
}

