# python_smoke_server.py
import asyncio, json, csv, os, datetime, sys
import websockets

OUT = 'smoke_data.csv'
if not os.path.exists(OUT):
    with open(OUT,'w',newline='') as f:
        w = csv.writer(f)
        w.writerow(['ts','engine','vehicleId','speed','soc','batteryVoltage','motorRPM','gps','charging','extra'])

async def handler(ws, path):
    addr = ws.remote_address
    print('client connected', addr)
    async for msg in ws:
        try:
            obj = json.loads(msg)
            with open(OUT,'a',newline='') as f:
                w = csv.writer(f)
                w.writerow([obj.get('ts'), obj.get('engine'), obj.get('vehicleId'), obj.get('speed'), obj.get('soc'),
                            obj.get('batteryVoltage'), obj.get('motorRPM'), json.dumps(obj.get('gps')), json.dumps(obj.get('charging')), json.dumps(obj.get('extra'))])
            print('received', obj.get('vehicleId'), 'soc', obj.get('soc'))
        except Exception as e:
            print('bad msg', e, file=sys.stderr)

async def main():
    async with websockets.serve(handler, 'localhost', 8765):
        print('smoke server listening on ws://localhost:8765')
        await asyncio.Future()

if __name__ == '__main__':
    asyncio.run(main())
