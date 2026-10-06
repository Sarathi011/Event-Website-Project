"""Vibrant Events web app + MongoDB API. Install requirements.txt before running."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parent
DRIVER_PATH=ROOT/'mongo-driver.zip'
if not DRIVER_PATH.exists():
    DRIVER_PATH=ROOT/'mongo-driver' if (ROOT/'mongo-driver').is_dir() else ROOT/'.vendor'
sys.path.insert(0,str(DRIVER_PATH))
from urllib.parse import urlparse
from datetime import datetime, timezone
import base64, hashlib, hmac, json, os, re, secrets, sqlite3, time, uuid

try:
    from pymongo import MongoClient, DESCENDING
    from pymongo.errors import DuplicateKeyError, PyMongoError
except ImportError:
    raise SystemExit("MongoDB driver archive is missing. Restore mongo-driver.zip from the project package.")

DB_FILE=ROOT/'vibrant-events.sqlite3'
UPLOAD_DIR=ROOT/'uploads'
URI=os.environ.get('MONGODB_URI','mongodb://127.0.0.1:27017')
DATABASE=os.environ.get('MONGODB_DATABASE','vibrant_events')
client=MongoClient(URI,serverSelectionTimeoutMS=3500)
db=client[DATABASE]
PHOTOS={'Technology':'photo-1540575467063-178a50c2df87','Music':'photo-1501386761578-eac5c94b800a','Business':'photo-1521737711867-e3b97375f902','Design':'photo-1558655146-9f40138edfeb','Wellness':'photo-1506126613408-eca07ce68773','Food':'photo-1517248135467-4c7edcad34c4','Sports':'photo-1461896836934-ffe607ba8211','Education':'photo-1523580494863-6f3031224c94','Travel':'photo-1464822759023-fed622ff2c3b','Arts & Culture':'photo-1577083552431-6e5fd01aa342'}
SEED=[
 {'id':1,'title':'TechInnovation Summit 2026','category':'Technology','location':'Chennai','date':'Oct 18, 2026','time':'9:30 AM','price':499,'photo':'photo-1540575467063-178a50c2df87','description':'A day of bold ideas, practical workshops, and conversations with technology leaders.','capacity':100,'owner_id':None},
 {'id':2,'title':'Indie Nights: Live in the City','category':'Music','location':'Bengaluru','date':'Oct 24, 2026','time':'7:00 PM','price':799,'photo':'photo-1501386761578-eac5c94b800a','description':'An intimate evening of independent music and new voices.','capacity':100,'owner_id':None},
 {'id':3,'title':'The Future of Creative Work','category':'Business','location':'Online','date':'Nov 02, 2026','time':'4:00 PM','price':0,'photo':'photo-1521737711867-e3b97375f902','description':'A practical conversation with founders and creative leaders.','capacity':100,'owner_id':None},
 {'id':4,'title':'Design Futures: Make Better','category':'Design','location':'Mumbai','date':'Nov 08, 2026','time':'10:00 AM','price':1299,'photo':'photo-1558655146-9f40138edfeb','description':'A hands-on gathering for designers exploring inclusive digital experiences.','capacity':100,'owner_id':None},
 {'id':5,'title':'Mindful Mornings by the Sea','category':'Wellness','location':'Chennai','date':'Nov 15, 2026','time':'6:30 AM','price':299,'photo':'photo-1506126613408-eca07ce68773','description':'Guided movement, meditation, and breakfast beside the sea.','capacity':100,'owner_id':None},
 {'id':6,'title':'Founders & Builders Meetup','category':'Business','location':'Bengaluru','date':'Nov 21, 2026','time':'6:00 PM','price':399,'photo':'photo-1511632765486-a01980e01a18','description':'Share what you are building and meet your next collaborator.','capacity':100,'owner_id':None},
]

def recommend(query):
    """Extract simple preferences from a natural-language request and explain the picks."""
    q=str(query or '').strip().lower()
    if not q:
        return {'message':'Tell me what you enjoy, which city you prefer, or how much you want to spend, and I’ll find a few events for you.','recommendations':[]}
    if re.fullmatch(r'(hi|hello|hey|good morning|good evening|howdy)[!. ]*',q):
        return {'message':'Hey! I can help find an event that fits you. Try something like “live music in Bengaluru under ₹1,000” or “a free event this month”.','recommendations':[]}
    if any(term in q for term in ('how do i book','how to book','book a ticket','booking help','how can i book')):
        return {'message':'Choose an event card to open its details, select your ticket type and quantity, then continue to checkout. Sign in is needed to save the booking. Checkout is currently a demo and does not charge your card.','recommendations':[]}
    categories={
        'Music':('music','concert','gig','live show','indie','band','singer'),
        'Technology':('technology','tech','coding','developer','programming','ai','artificial intelligence','startup tech'),
        'Business':('business','founder','founders','entrepreneur','networking','startup','career','leadership'),
        'Design':('design','designer','creative','creativity','art','ui','ux'),
        'Wellness':('wellness','yoga','meditation','mindful','fitness','health','relax'),
    }
    category=next((name for name,terms in categories.items() if any(term in q for term in terms)),None)
    cities={'Chennai':('chennai',),'Bengaluru':('bengaluru','bangalore'),'Mumbai':('mumbai',),'Online':('online','virtual','remote')}
    city=next((name for name,terms in cities.items() if any(term in q for term in terms)),None)
    amount=re.search(r'(?:under|below|less than|up to|upto|within|max(?:imum)?|budget(?: of)?)\s*(?:₹|rs\.?\s*)?([\d,]+)|₹\s*([\d,]+)|([\d,]+)\s*(?:rupees|rs\b)',q)
    budget=int((next(x for x in amount.groups() if x) or '0').replace(',','')) if amount else (0 if 'free' in q else None)
    all_events=[public(x) for x in db.events.find()]
    matches=[e for e in all_events if (not category or e.get('category')==category) and (not city or e.get('location')==city) and (budget is None or int(e.get('price',0))<=budget)]
    # For a specific event/topic not covered by a category, score its actual words.
    stop={'event','events','find','show','suggest','recommend','recommendation','please','want','looking','for','with','some','any','good','best','under','below','less','than','up','to','within','budget','rupees','rs','in','at','near','me','my','the','a','an','and','or','this','month','weekend','around','something'}
    terms=[x for x in re.findall(r'[a-z]+',q) if x not in stop and len(x)>2 and x not in {'chennai','bengaluru','bangalore','mumbai','online','virtual','remote'}]
    if category or city or budget is not None:
        ranked=sorted(matches,key=lambda e:sum(term in (e.get('title','')+' '+e.get('description','')).lower() for term in terms),reverse=True)
    else:
        ranked=sorted(all_events,key=lambda e:(sum(term in (e.get('title','')+' '+e.get('category','')+' '+e.get('location','')+' '+e.get('description','')).lower() for term in terms),-e.get('price',0)),reverse=True)
        if terms and ranked and not any(any(term in (e.get('title','')+' '+e.get('category','')+' '+e.get('location','')+' '+e.get('description','')).lower() for term in terms) for e in ranked):
            ranked=[]
    picks=ranked[:3]
    if not picks:
        prefs=[]
        if category:prefs.append(category.lower())
        if city:prefs.append('events in '+city)
        if budget is not None:prefs.append('free events' if budget==0 else 'events under ₹'+format(budget,','))
        requested=', '.join(prefs) or 'that exact topic'
        return {'message':f'I couldn’t find a current listing for {requested}. Try widening the budget or changing the city, and I’ll look again.','recommendations':[]}
    first=picks[0]
    openers=('I found a good match','Here’s a pick that fits','This one looks like a strong fit')
    opener=openers[sum(ord(ch) for ch in q)%len(openers)]
    details=f"{first['title']} in {first['location']} on {first['date']}. Tickets start at {'Free' if int(first['price'])==0 else '₹'+format(int(first['price']),',')}."
    context=[]
    if category:context.append(f"your interest in {category.lower()}")
    if city:context.append(f"your {city} location")
    if budget is not None:context.append(f"your {'free-event' if budget==0 else '₹'+format(budget,',')+' budget'} preference")
    reason=(' It matches '+', '.join(context)+'.') if context else ' I picked it from the events currently listed.'
    if len(picks)>1: reason+=f" You can also compare {picks[1]['title']} and {picks[2]['title'] if len(picks)>2 else picks[1]['location']}."
    return {'message':f'{opener}: {details}{reason}','recommendations':picks}

def public(doc):
    return {k:v for k,v in doc.items() if k not in ('_id','salt','password_hash')}
def next_id(collection):
    row=db.counters.find_one_and_update({'_id':collection},{'$inc':{'value':1}},upsert=True,return_document=True)
    return row['value']
def initialize():
    client.admin.command('ping')
    db.users.create_index('email',unique=True); db.events.create_index('id',unique=True)
    db.bookings.create_index('id',unique=True); db.sessions.create_index('token',unique=True)
    db.plans.create_index('id',unique=True); db.reviews.create_index('id',unique=True)
    db.reviews.create_index([('event_id',1),('user_id',1)], unique=True)
    # One-time import preserves records from the earlier SQLite version.
    if not db.migrations.find_one({'_id':'sqlite-import-v1'}):
        if DB_FILE.exists():
            old=sqlite3.connect(DB_FILE); old.row_factory=sqlite3.Row
            for collection, table in [('users','users'),('events','events'),('bookings','bookings'),('sessions','sessions'),('plans','plans')]:
                try: docs=[dict(row) for row in old.execute(f'SELECT * FROM {table}').fetchall()]
                except sqlite3.Error: docs=[]
                for d in docs:
                    if collection=='users': d['id']=int(d['id'])
                    if collection=='events': d['id']=int(d['id']); d.setdefault('capacity',100); d.setdefault('owner_id',None)
                    if collection=='bookings': d['id']=int(d['id']); d['event_id']=int(d['event_id']); d['user_id']=int(d['user_id'])
                    if collection=='sessions': d['expires']=int(d['expires'])
                    if collection=='plans':
                        d['id']=int(d['id']); d['user_id']=int(d['user_id'])
                        try:d['event_ids']=json.loads(d.pop('event_ids','[]'));d['votes']=json.loads(d.pop('votes','{}'))
                        except (TypeError,ValueError):d['event_ids']=[];d['votes']={}
                    try: db[collection].insert_one(d)
                    except DuplicateKeyError: pass
            old.close()
        db.migrations.insert_one({'_id':'sqlite-import-v1','at':datetime.now(timezone.utc)})
    if db.events.count_documents({})==0: db.events.insert_many(SEED)
    # Keep numeric IDs increasing after seeds or legacy import.
    for coll in ('users','events','bookings','plans','reviews'):
        maximum=max([int(x.get('id',0)) for x in db[coll].find({}, {'id':1})] or [0])
        db.counters.update_one({'_id':coll},{'$max':{'value':maximum}},upsert=True)

class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(ROOT),**kwargs)
    def log_message(self,fmt,*args):print('[%s] %s'%(self.log_date_time_string(),fmt%args))
    def send_json(self,status,data):
        body=json.dumps(data,ensure_ascii=False,default=str).encode();self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Content-Length',str(len(body)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(body)
    def body(self):
        size=int(self.headers.get('Content-Length',0))
        if size>8*1024*1024:raise ValueError('Request is too large. Images must be 5 MB or smaller.')
        try:return json.loads(self.rfile.read(size) or b'{}')
        except (ValueError,TypeError):raise ValueError('Request body must be valid JSON.')
    def user(self):
        token=self.headers.get('Authorization','').removeprefix('Bearer ')
        if not token:return None
        sess=db.sessions.find_one({'token':token,'expires':{'$gte':int(time.time())}})
        if not sess:return None
        row=db.users.find_one({'id':sess['user_id']})
        if not row:return None
        role=row.get('role')
        if role not in ('organizer','attendee'):
            role='organizer' if db.events.count_documents({'owner_id':row['id']}) else 'attendee'
            db.users.update_one({'id':row['id']},{'$set':{'role':role}});row['role']=role
        return public(row)
    def require_user(self):
        user=self.user()
        if not user:self.send_json(401,{'error':'Please sign in to continue.'})
        return user
    def require_role(self,*roles):
        user=self.require_user()
        if user and user.get('role') not in roles:
            self.send_json(403,{'error':'This action is not available for your account role.'})
            return None
        return user
    def do_GET(self):
        path=urlparse(self.path).path
        if not path.startswith('/api/'):return super().do_GET()
        try:
            if path=='/api/health':return self.send_json(200,{'ok':True,'service':'Vibrant Events API','database':DATABASE})
            if path=='/api/events':return self.send_json(200,[public(x) for x in db.events.find().sort('id',DESCENDING)])
            review_match=re.fullmatch(r'/api/events/(\d+)/reviews',path)
            if review_match:
                event_id=int(review_match.group(1)); event=db.events.find_one({'id':event_id})
                if not event:return self.send_json(404,{'error':'Event not found.'})
                user=self.user(); reviews=list(db.reviews.find({'event_id':event_id}).sort('created_at',DESCENDING)); out=[]
                for review in reviews:
                    reviewer=db.users.find_one({'id':review['user_id']})
                    out.append({**public(review),'user_name':reviewer.get('name') if reviewer else 'Guest','user_email':reviewer.get('email') if reviewer else '','can_delete':bool(user and (review['user_id']==user['id'] or event.get('owner_id')==user['id']))})
                avg=round(sum(int(r['rating']) for r in reviews)/len(reviews),1) if reviews else 0
                return self.send_json(200,{'reviews':out,'average_rating':avg,'total_reviews':len(out)})
            if path.startswith('/api/events/'):
                ev=db.events.find_one({'id':int(path.rsplit('/',1)[1])});return self.send_json(200,public(ev)) if ev else self.send_json(404,{'error':'Event not found.'})
            if path=='/api/auth/me':
                u=self.user();return self.send_json(200,{'user':u}) if u else self.send_json(401,{'error':'Sign in required.'})
            if path in ('/api/bookings','/api/organizer/stats','/api/organizer/events','/api/organizer/attendees','/api/organizer/analytics'):
                u=self.require_role('attendee' if path=='/api/bookings' else 'organizer')
                if not u:return
                if path=='/api/bookings':
                    docs=list(db.bookings.find({'user_id':u['id']}).sort('id',DESCENDING))
                    return self.send_json(200,[dict(public(b),**{k:v for k,v in (db.events.find_one({'id':b['event_id']}) or {}).items() if k in ('title','date','location')}) for b in docs])
                own=list(db.events.find({'owner_id':u['id']}))
                if path=='/api/organizer/events':return self.send_json(200,[public(e) for e in sorted(own,key=lambda x:x['id'],reverse=True)])
                all_events=list(db.events.find())
                events_by_id={e['id']:e for e in all_events}
                confirmed_bookings=list(db.bookings.find({'status':'Confirmed'}).sort('id',DESCENDING))
                attendee_emails={str(b.get('email','')).strip().lower() for b in confirmed_bookings if b.get('email')}
                if path=='/api/organizer/attendees':
                    out=[]
                    for b in confirmed_bookings:
                        e=events_by_id.get(b['event_id'],{});out.append(dict(public(b),title=e.get('title','Event unavailable'),date=e.get('date','')))
                    return self.send_json(200,out)
                if path=='/api/organizer/analytics':
                    return self.send_json(200,{
                        'events':len(all_events),
                        'tickets':sum(int(b.get('qty',0)) for b in confirmed_bookings),
                        'revenue':sum(int(b.get('total',0)) for b in confirmed_bookings),
                        'attendees':len(attendee_emails),
                    })
                return self.send_json(200,{'events':len(all_events),'tickets':sum(int(b.get('qty',0)) for b in confirmed_bookings),'revenue':sum(int(b.get('total',0)) for b in confirmed_bookings),'attendees':len(attendee_emails)})
            if path=='/api/plans':
                u=self.require_role('attendee')
                if not u:return
                return self.send_json(200,[public(x) for x in db.plans.find({'user_id':u['id']}).sort('updated_at',DESCENDING)])
            return self.send_json(404,{'error':'API route not found.'})
        except (ValueError,TypeError):return self.send_json(400,{'error':'Invalid request.'})
        except PyMongoError as ex:return self.send_json(503,{'error':'MongoDB is not reachable. Start MongoDB Server and check MONGODB_URI.'})
        except Exception as ex:return self.send_json(500,{'error':str(ex)})
    def do_POST(self):
        path=urlparse(self.path).path
        if not path.startswith('/api/'):return self.send_json(404,{'error':'Route not found.'})
        try:
            data=self.body()
            if path in ('/api/auth/register','/api/auth/login'):
                email=str(data.get('email','')).strip().lower();password=str(data.get('password',''))
                if not email or len(password)<8:return self.send_json(400,{'error':'Enter a valid email and a password with at least 8 characters.'})
                if path.endswith('register'):
                    role=str(data.get('role','attendee')).strip().lower()
                    if role not in ('organizer','attendee'):return self.send_json(400,{'error':'Choose Organizer or Attendee as your account type.'})
                    salt=secrets.token_bytes(16);digest=hashlib.scrypt(password.encode(),salt=salt,n=2**14,r=8,p=1).hex()
                    try:db.users.insert_one({'id':next_id('users'),'name':str(data.get('name','')).strip() or email.split('@')[0],'email':email,'role':role,'salt':salt.hex(),'password_hash':digest,'created_at':datetime.now(timezone.utc)})
                    except DuplicateKeyError:return self.send_json(409,{'error':'An account with that email already exists.'})
                row=db.users.find_one({'email':email})
                check=hashlib.scrypt(password.encode(),salt=bytes.fromhex(row['salt']),n=2**14,r=8,p=1).hex() if row else ''
                if not row or not hmac.compare_digest(check,row['password_hash']):return self.send_json(401,{'error':'Email or password is incorrect.'})
                token=secrets.token_urlsafe(36);db.sessions.insert_one({'token':token,'user_id':row['id'],'expires':int(time.time())+60*60*24*14})
                role=row.get('role')
                if role not in ('organizer','attendee'):
                    role='organizer' if db.events.count_documents({'owner_id':row['id']}) else 'attendee'
                    db.users.update_one({'id':row['id']},{'$set':{'role':role}});row['role']=role
                return self.send_json(200,{'token':token,'user':{'id':row['id'],'name':row['name'],'email':row['email'],'role':role}})
            review_match=re.fullmatch(r'/api/events/(\d+)/reviews',path)
            if review_match:
                user=self.require_role('attendee')
                if not user:
                    return
                event_id=int(review_match.group(1)); event=db.events.find_one({'id':event_id})
                if not event:return self.send_json(404,{'error':'Event not found.'})
                if not db.bookings.find_one({'event_id':event_id,'user_id':user['id']}):return self.send_json(403,{'error':'Book this event before leaving a review.'})
                rating=int(data.get('rating',0)); comment=str(data.get('comment','')).strip()
                if rating<1 or rating>5:return self.send_json(400,{'error':'Choose a rating between 1 and 5.'})
                if len(comment)<3 or len(comment)>500:return self.send_json(400,{'error':'Write a short review between 3 and 500 characters.'})
                if db.reviews.find_one({'event_id':event_id,'user_id':user['id']}):return self.send_json(409,{'error':'You have already reviewed this event.'})
                review={'id':next_id('reviews'),'event_id':event_id,'user_id':user['id'],'rating':rating,'comment':comment,'created_at':datetime.now(timezone.utc)}
                db.reviews.insert_one(review)
                reviewer=db.users.find_one({'id':user['id']})
                return self.send_json(201,{**public(review),'user_name':reviewer.get('name') if reviewer else user.get('name'),'user_email':reviewer.get('email') if reviewer else user.get('email'),'can_delete':True})
            if path=='/api/ai/recommendations':
                return self.send_json(200,recommend(data.get('query','')))
            if path=='/api/events':
                user=self.require_role('organizer')
                if not user:return
            elif path in ('/api/bookings','/api/plans'):
                user=self.require_role('attendee')
                if not user:return
            else:
                return self.send_json(404,{'error':'API route not found.'})
            if path=='/api/events':
                if any(not str(data.get(k,'')).strip() for k in ('title','category','location','date','time','description')):return self.send_json(400,{'error':'Complete all required event fields.'})
                category=str(data['category']).strip()
                photo=PHOTOS.get(category,PHOTOS['Business'])
                raw_image=None
                image_data=data.get('imageData')
                if image_data:
                    match=re.fullmatch(r'data:image/(jpeg|png|webp|gif);base64,([A-Za-z0-9+/=]+)',str(image_data))
                    if not match:return self.send_json(400,{'error':'Choose a valid JPG, PNG, WEBP, or GIF image.'})
                    try:raw_image=base64.b64decode(match.group(2),validate=True)
                    except ValueError:return self.send_json(400,{'error':'The selected image could not be read.'})
                    if not raw_image or len(raw_image)>5*1024*1024:return self.send_json(400,{'error':'Image must be no larger than 5 MB.'})
                    ext='jpg' if match.group(1)=='jpeg' else match.group(1)
                    filename=f"{uuid.uuid4().hex}.{ext}"
                    photo=f'/uploads/{filename}'
                ev={'id':next_id('events'),'title':str(data['title']).strip(),'category':category,'location':str(data['location']).strip(),'date':str(data['date']),'time':str(data['time']),'price':max(0,int(data.get('price',0))),'photo':photo,'description':str(data['description']).strip(),'capacity':max(1,int(data.get('capacity',100))),'owner_id':user['id']}
                if raw_image is not None:
                    UPLOAD_DIR.mkdir(parents=True,exist_ok=True)
                    (UPLOAD_DIR/filename).write_bytes(raw_image)
                db.events.insert_one(ev);return self.send_json(201,public(ev))
            if path=='/api/bookings':
                event_id=int(data.get('eventId',0));qty=int(data.get('qty',0));ticket=str(data.get('ticket','general'))
                if qty<1 or qty>10:return self.send_json(400,{'error':'Choose between 1 and 10 tickets.'})
                ev=db.events.find_one({'id':event_id})
                if not ev:return self.send_json(404,{'error':'Event not found.'})
                sold=sum(int(b.get('qty',0)) for b in db.bookings.find({'event_id':event_id}))
                if sold+qty>int(ev.get('capacity',100)):return self.send_json(409,{'error':'There are not enough tickets left.'})
                unit=1499 if ticket=='vip' else 299 if ticket=='student' else int(ev['price'])
                booking={'id':next_id('bookings'),'event_id':event_id,'user_id':user['id'],'name':str(data.get('name') or user['name']),'email':str(data.get('email') or user['email']),'qty':qty,'total':unit*qty,'ticket':ticket,'status':'Confirmed','created_at':datetime.now(timezone.utc)}
                db.bookings.insert_one(booking);return self.send_json(201,dict(public(booking),title=ev['title'],date=ev['date'],location=ev['location']))
            if path=='/api/plans':
                pid=int(data.get('id') or 0);doc={'user_id':user['id'],'name':data.get('name','Weekend plan'),'city':data.get('city',''),'budget':int(data.get('budget',0)),'event_ids':data.get('eventIds',[]),'votes':data.get('votes',{}),'updated_at':datetime.now(timezone.utc)}
                saved=db.plans.find_one({'id':pid,'user_id':user['id']}) if pid else None
                if saved:db.plans.update_one({'id':pid,'user_id':user['id']},{'$set':doc});out=db.plans.find_one({'id':pid})
                else:doc['id']=next_id('plans');db.plans.insert_one(doc);out=doc
                return self.send_json(200,public(out))
            return self.send_json(404,{'error':'API route not found.'})
        except (ValueError,TypeError):return self.send_json(400,{'error':'Invalid request.'})
        except PyMongoError as ex:return self.send_json(503,{'error':'MongoDB is not reachable. Start MongoDB Server and check MONGODB_URI.'})
        except Exception as ex:return self.send_json(500,{'error':str(ex)})

    def do_PUT(self):
        path=urlparse(self.path).path
        match=re.fullmatch(r'/api/events/(\d+)',path)
        if not match:return self.send_json(404,{'error':'Route not found.'})
        try:
            data=self.body();user=self.require_role('organizer')
            if not user:return
            event_id=int(match.group(1));existing=db.events.find_one({'id':event_id})
            if not existing:return self.send_json(404,{'error':'Event not found.'})
            if existing.get('owner_id') not in (None,user['id']):return self.send_json(403,{'error':'You can only edit shared events or events you own.'})
            required=('title','category','location','date','time','description')
            if any(not str(data.get(k,'')).strip() for k in required):return self.send_json(400,{'error':'Complete all required event fields.'})
            updates={'title':str(data['title']).strip(),'category':str(data['category']).strip(),'location':str(data['location']).strip(),'date':str(data['date']).strip(),'time':str(data['time']).strip(),'price':max(0,int(data.get('price',0))),'description':str(data['description']).strip(),'capacity':max(1,int(data.get('capacity',100)))}
            sold=sum(int(b.get('qty',0)) for b in db.bookings.find({'event_id':event_id}))
            if updates['capacity']<sold:return self.send_json(409,{'error':f'Capacity cannot be lower than the {sold} tickets already booked.'})
            image_data=data.get('imageData')
            if image_data:
                image_match=re.fullmatch(r'data:image/(jpeg|png|webp|gif);base64,([A-Za-z0-9+/=]+)',str(image_data))
                if not image_match:return self.send_json(400,{'error':'Choose a valid JPG, PNG, WEBP, or GIF image.'})
                try:raw_image=base64.b64decode(image_match.group(2),validate=True)
                except ValueError:return self.send_json(400,{'error':'The selected image could not be read.'})
                if not raw_image or len(raw_image)>5*1024*1024:return self.send_json(400,{'error':'Image must be no larger than 5 MB.'})
                ext='jpg' if image_match.group(1)=='jpeg' else image_match.group(1);filename=f'{uuid.uuid4().hex}.{ext}'
                UPLOAD_DIR.mkdir(parents=True,exist_ok=True);(UPLOAD_DIR/filename).write_bytes(raw_image);updates['photo']=f'/uploads/{filename}'
            updated=db.events.find_one_and_update({'id':event_id},{'$set':updates},return_document=True)
            return self.send_json(200,public(updated))
        except (ValueError,TypeError):return self.send_json(400,{'error':'Invalid event details.'})
        except PyMongoError:return self.send_json(503,{'error':'MongoDB is not reachable. Start MongoDB Server and check MONGODB_URI.'})
        except Exception as ex:return self.send_json(500,{'error':str(ex)})

    def do_DELETE(self):
        path=urlparse(self.path).path
        review_match=re.fullmatch(r'/api/events/(\d+)/reviews/(\d+)',path)
        if review_match:
            try:
                user=self.require_role('attendee')
                if not user:
                    return
                event_id=int(review_match.group(1)); review_id=int(review_match.group(2))
                review=db.reviews.find_one({'id':review_id,'event_id':event_id})
                if not review:return self.send_json(404,{'error':'Review not found.'})
                event=db.events.find_one({'id':event_id}) or {}
                if review['user_id'] != user['id'] and event.get('owner_id') != user['id']:
                    return self.send_json(403,{'error':'You can only delete your own review or remove reviews from your own event.'})
                db.reviews.delete_one({'id':review_id})
                return self.send_json(200,{'ok':True,'id':review_id})
            except PyMongoError:return self.send_json(503,{'error':'MongoDB is not reachable. Start MongoDB Server and check MONGODB_URI.'})
            except Exception as ex:return self.send_json(500,{'error':str(ex)})
        match=re.fullmatch(r'/api/events/(\d+)',path)
        if not match:return self.send_json(404,{'error':'Route not found.'})
        try:
            user=self.require_role('organizer')
            if not user:return
            event_id=int(match.group(1));existing=db.events.find_one({'id':event_id})
            if not existing:return self.send_json(404,{'error':'Event not found.'})
            if existing.get('owner_id') not in (None,user['id']):return self.send_json(403,{'error':'You can only delete shared events or events you own.'})
            if db.bookings.count_documents({'event_id':event_id}):return self.send_json(409,{'error':'This event has bookings, so it cannot be deleted. Keep it available for ticket holders.'})
            db.events.delete_one({'id':event_id})
            db.plans.update_many({}, {'$pull':{'event_ids':event_id},'$unset':{f'votes.{event_id}':''}})
            return self.send_json(200,{'ok':True,'id':event_id})
        except PyMongoError:return self.send_json(503,{'error':'MongoDB is not reachable. Start MongoDB Server and check MONGODB_URI.'})
        except Exception as ex:return self.send_json(500,{'error':str(ex)})

if __name__=='__main__':
    try:initialize()
    except PyMongoError as ex:raise SystemExit(f"Cannot connect to MongoDB at {URI}. Start MongoDB Server or set MONGODB_URI. Details: {ex}")
    host=os.environ.get('VIBRANT_HOST','127.0.0.1');port=int(os.environ.get('VIBRANT_PORT','8765'))
    print(f"Vibrant Events connected to MongoDB database '{DATABASE}' at {URI}")
    print(f"Website running at http://{host}:{port} (Ctrl+C to stop)")
    ThreadingHTTPServer((host,port),Handler).serve_forever()
