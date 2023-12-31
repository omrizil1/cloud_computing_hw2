const express = require('express');
const axios = require('axios');
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const cron = require('node-cron');
const crypto = require('crypto');
const app = express();
const port = 8000;

AWS.config.update({ region: 'us-east-1' });
const ec2 = new AWS.EC2();
app.use(express.json());
let lastRun = Date.now()
const instanceName1 ='first';
const instanceName2 = 'second';
let nodesIps = []
let initIps = false
let finishInit = false;
let lockTerminateInstance = false;

app.listen(port, () => console.log(`Express app running on port ${port}!`));


function work(buffer, iterations) {
    return new Promise((resolve, reject) => {
        try {
            let output = crypto.createHash('sha512').update(buffer).digest();
            for (let i = 0; i < iterations - 1; i++) {
                output = crypto.createHash('sha512').update(output).digest();
            }
            resolve(output);
        } catch (error) {
            reject(error);
        }
    });
}

const getInstanceIpAddress = async (instanceName) => {
    const params = {
        Filters: [
            {
                Name: 'tag:Name',
                Values: [instanceName]
            }
        ]
    };

    try {
        console.log("getInstanceIpAddress " ,instanceName)
        const response = await ec2.describeInstances(params).promise();
        const instances = response.Reservations
            .flatMap(reservation => reservation.Instances)
            .filter(instance => instance.State.Name === 'running');
        if (instances.length > 0) {
            return instances[0].PublicIpAddress || instances[0].PrivateIpAddress;
        } else {
            console.log(`No instances found with the name '${instanceName}'.`);
            return null;
        }
    } catch (error) {
        console.log('Error retrieving instance details:', error);
        return null;
    }
};

async function getWork() {
    if (Date.now() - lastRun > 90000 && !lockTerminateInstance) {
        lockTerminateInstance = true
        console.log("Start terminating process")
       let instanceId = await getInstanceId()
        console.log("instanceId", instanceId, typeof (instanceId))
        const params = {
            InstanceIds: [instanceId]
        };
        for (let ip of nodesIps) {
            let response = await axios.get(`http://${ip}:8000/freeWorker`)
            console.log(`freeWorker for ${ip} got response.data of ${response.data}`)
            if (response.data > 0 ) {
                break
            }
        }
        try {
            await ec2.terminateInstances(params).promise();
            console.log(`Instance ${instanceId} terminated successfully.`);
        } catch (error) {
            console.error(`Error terminating instance ${instanceId}:`, error);
        }
    } else {
        for (let ip of nodesIps) {
            console.log("getting work for ip:" ,ip)
            let workObjectResponse;
            try {
                workObjectResponse = await axios.get(`http://${ip}:8000/giveWork`);
            } catch (error) {
                console.log(error)
                return
            }
            let workData = workObjectResponse.data
            if (workData) {
                console.log(`got work from ${ip} the work is ${workObjectResponse.data}`)
                let workData = workObjectResponse.data
                work(workData.buffer, workData.iterations)
                    .then(output => {
                        console.log(`WorkData ${workData} Output is: ${output} for workData`)
                        let result = {
                            finalValue : output,
                            id : workData.id
                        }
                        axios.post(`http://${ip}:8000/submitWork`, result)
                            .then(response => {
                                console.log('Result submitted successfully', response.data);
                            })
                            .catch(error => {
                                console.log('Error submitting result:', error);
                            });
                    }).catch(error => {
                    console.log('Error processing work:', error);
                });
                lastRun = Date.now()
            }
        }
    }
}

async function getInstanceId() {
    try {
        console.log("getInstanceId run")
        const response = await axios.get('http://169.254.169.254/latest/meta-data/instance-id');
        console.log("instanceId is ", response.data)
        console.log("instanceId is type ", typeof(response.data))
        return response.data;
    } catch (error) {
        console.log('Error retrieving instance ID:', error);
    }
}

cron.schedule('*/8 * * * * *',  async() => {
    if (!initIps)  {
        initIps = true
        console.log("Init ips")
        let firstIp = await getInstanceIpAddress(instanceName1)
        console.log("First Ip", firstIp)
        let secondIp = await getInstanceIpAddress(instanceName2)
        console.log("Second Ip", secondIp)
        nodesIps.push(firstIp)
        nodesIps.push(secondIp)
        console.log("Finish Init")
        finishInit = true
    } if (finishInit) {
        getWork().then(r => r)
    }

})
