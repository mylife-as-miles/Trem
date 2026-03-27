
import http from 'http';

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/predictions',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    }
};

const req = http.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    console.log(`HEADERS: ${JSON.stringify(res.headers)}`);

    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        console.log('BODY START:');
        console.log(data.substring(0, 200));
        console.log('BODY END');
    });
});

req.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
});

// Send a dummy body
req.write(JSON.stringify({
    input: { audio: "test" }
}));
req.end();
