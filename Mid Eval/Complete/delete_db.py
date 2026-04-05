# This script connects to a local MongoDB instance, accesses the "arena_db" database and the "profile_images" collection,
#  and deletes a specific player based on their roll number (uid). It then checks if the deletion was successful and prints an appropriate message.
import pymongo

# 1. Connect to your local MongoDB
client = pymongo.MongoClient("mongodb://localhost:27017")
db = client["arena_db"]
collection = db["profile_images"]

# 2. Delete ALL documents in the collection
result = collection.delete_many({})

# 3. See how many were wiped out
print(f"💥 Successfully deleted {result.deleted_count} total users from MongoDB!")