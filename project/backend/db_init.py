"""
Database Initialization Script
Creates tables and enables PostGIS extension in Neon DB
"""
import asyncio
import os
from dotenv import load_dotenv
from neon_db import neon_db

load_dotenv()


async def init_database():
    """Initialize database schema"""
    try:
        # Connect to database
        await neon_db.connect()
        
        # Read and execute main schema SQL
        schema_file = os.path.join(os.path.dirname(__file__), 'db_schema.sql')
        
        with open(schema_file, 'r') as f:
            schema_sql = f.read()
        
        # Split by semicolons and execute each statement
        statements = [s.strip() for s in schema_sql.split(';') if s.strip()]
        
        for statement in statements:
            if statement:
                try:
                    await neon_db.execute_command(statement)
                    print(f"✓ Executed: {statement[:50]}...")
                except Exception as e:
                    # Ignore errors for IF NOT EXISTS statements
                    if "already exists" not in str(e).lower():
                        print(f"⚠ Warning: {e}")
        
        # Read and execute GPS schema update
        gps_schema_file = os.path.join(os.path.dirname(__file__), 'db_schema_gps_update.sql')
        
        if os.path.exists(gps_schema_file):
            with open(gps_schema_file, 'r') as f:
                gps_schema_sql = f.read()
            
            gps_statements = [s.strip() for s in gps_schema_sql.split(';') if s.strip()]
            
            for statement in gps_statements:
                if statement:
                    try:
                        await neon_db.execute_command(statement)
                        print(f"✓ Executed GPS schema: {statement[:50]}...")
                    except Exception as e:
                        # Ignore errors for IF NOT EXISTS/IF EXISTS statements
                        if "already exists" not in str(e).lower() and "does not exist" not in str(e).lower():
                            print(f"⚠ Warning: {e}")
        
        print("\n✅ Database schema initialized successfully!")
        
        # Verify PostGIS is enabled
        try:
            result = await neon_db.execute_fetchone(
                "SELECT PostGIS_version() as version"
            )
            if result:
                print(f"✅ PostGIS version: {result.get('version', 'Unknown')}")
        except Exception as e:
            print(f"⚠️ Could not verify PostGIS version: {e}")
        
    except Exception as e:
        print(f"❌ Error initializing database: {e}")
        raise
    finally:
        await neon_db.disconnect()


if __name__ == "__main__":
    asyncio.run(init_database())

