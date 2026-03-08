# AWS credentials must be configured first
 
import boto3, json
from decimal import Decimal
 
dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
 
# Import services
print('Importing 15 service records...')
svc_table = dynamodb.Table('JanMitra_Services')
with open('seed_services.json', encoding='utf-8') as f:
    services = json.load(f)
with svc_table.batch_writer() as batch:
    for item in services:
        batch.put_item(Item=item)
print(f'  Done: {len(services)} records')
 
# Import offices (convert float lat/lng to Decimal for DynamoDB)
print('Importing 6 office records...')
off_table = dynamodb.Table('JanMitra_Offices')
with open('seed_offices.json', encoding='utf-8') as f:
    offices = json.load(f)
with off_table.batch_writer() as batch:
    for item in offices:
        item['latitude'] = Decimal(str(item['latitude']))
        item['longitude'] = Decimal(str(item['longitude']))
        batch.put_item(Item=item)
print(f'  Done: {len(offices)} records')
print('All data loaded! Verify in DynamoDB console.')
