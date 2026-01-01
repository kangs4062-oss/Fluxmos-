# python_simulator.py
# Sends EVS JSON messages to ws://localhost:8765 every 0.25s
import asyncio, json, random, time, websockets
async def run():
    uri = 'ws://localhost:8765'
    async with websockets.connect(uri) as ws:
        print('connected to', uri)
        vehicles = [{'id':f'V{n+1}', 'lat':37.773972+random.uniform(-0.01,0.01), 'lon':-122.431297+random.uniform(-0.01,0.01), 'soc':random.uniform(30,100)} for n in range(3)]
        while True:
            for v in vehicles:
                v['speed'] = max(0, v.get('speed', random.uniform(0,60)) + random.uniform(-3,3))
                v['soc'] = max(0, v['soc'] - v['speed']*0.0005 + (0 if random.random()>0.01 else -0.2))
                v['batteryVoltage'] = 300 + (v['soc']/100)*120 + random.uniform(-2,2)
                v['motorRPM'] = v['speed'] * random.uniform(20,40)
                payload = {'ts': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'engine':'EVS', 'vehicleId':v['id'],
                           'speed':round(v['speed'],2), 'soc':round(v['soc'],2), 'batteryVoltage':round(v['batteryVoltage'],2),
                           'motorRPM':int(v['motorRPM']), 'gps':[v['lat']+random.uniform(-0.0001,0.0001), v['lon']+random.uniform(-0.0001,0.0001)],
                           'charging':{'plugged':False,'kW':0}, 'extra':{'source':'py-sim'}}
                await ws.send(json.dumps(payload))
                print('sent', v['id'], payload['soc'])
                await asyncio.sleep(0.25)
asyncio.run(run())
