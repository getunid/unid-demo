import express from 'express'
import { engine } from 'express-handlebars'
import axios from 'axios'
import { Server } from 'aedes'
import { createServer } from 'net'
import { PrismaClient } from '@prisma/client'
import Handlebars from 'handlebars'
import moment from 'moment'

const prisma = new PrismaClient()

const http_port = 3000
const mqtt_port = 1883

const app = express()
const mqtt = Server({})
const broker = createServer(mqtt.handle)

app.engine('handlebars', engine());
app.set('view engine', 'handlebars');
app.set('views', './views');

Handlebars.registerHelper('json', (context) => {
    return JSON.stringify(context, null, 4)
})

Handlebars.registerHelper('datetime', (context) => {
    return (new Date(context)).toISOString()
})

app.get('/', async (req, res) => {
    const now = moment();

    const records = await prisma.record.findMany({
        take: 25,
        orderBy: { id: 'desc' },
        where: {
            createdAt: { gt: now.subtract(1, 'day').toDate() }
        }
    })

    return res.render('home', {
        records: records.map((x) => {
            return {
                id: x.id,
                createdAt: x.createdAt,
                container: JSON.parse(x.container),
                message: JSON.parse(x.message),
            }
        }),
    })
})

app.listen(http_port, () => {
    console.log(`listening on port ${ http_port }`)
})

mqtt.on('publish', async (packet, client) => {
    try {
        if (packet.topic === 'unid:demo') {
            const container = Buffer.from(packet.payload).toString('utf-8')
            const message = await axios.post('http:/internal/didcomm/encrypted-messages/verify', {
                message: JSON.parse(container)
            }, {
                socketPath: 'unid-agent.sock',
                headers: {
                    'content-type': 'application/json'
                }
            })

            const record = await prisma.record.create({
                data: {
                    container: container,
                    message: JSON.stringify(message.data),
                }
            })

            console.log(record)
        }
    } catch (err) {
        console.log(err)
    }
})

broker.listen(mqtt_port, function () {
    console.log('server started and listening on port ', mqtt_port)
})