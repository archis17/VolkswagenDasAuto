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
                    print(f"[OK] Executed: {statement[:50]}...")
                except Exception as e:
                    # Ignore errors for IF NOT EXISTS statements
                    if "already exists" not in str(e).lower():
                        print(f"[WARNING] {e}")
        
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
                        print(f"[OK] Executed GPS schema: {statement[:50]}...")
                    except Exception as e:
                        # Ignore errors for IF NOT EXISTS/IF EXISTS statements
                        if "already exists" not in str(e).lower() and "does not exist" not in str(e).lower():
                            print(f"[WARNING] {e}")
        
        # Read and execute extended schema (MQTT, Geofencing, Analytics)
        extended_schema_file = os.path.join(os.path.dirname(__file__), 'db_schema_extended.sql')
        
        if os.path.exists(extended_schema_file):
            print("\nApplying extended schema (MQTT, Geofencing, Analytics)...")
            with open(extended_schema_file, 'r', encoding='utf-8') as f:
                extended_schema_sql = f.read()
            
            # Better SQL parsing that handles functions with $$ delimiters
            import re
            
            # Remove comments
            extended_schema_sql = re.sub(r'--.*$', '', extended_schema_sql, flags=re.MULTILINE)
            
            # Split by semicolon, but preserve function bodies with $$ delimiters
            statements = []
            current_statement = ""
            dollar_count = 0
            in_dollar_quote = False
            dollar_tag = None
            
            i = 0
            while i < len(extended_schema_sql):
                char = extended_schema_sql[i]
                
                if char == '$' and i + 1 < len(extended_schema_sql):
                    # Check for dollar quoting ($$ or $tag$)
                    next_char = extended_schema_sql[i + 1]
                    if next_char == '$':
                        # Simple $$ delimiter
                        if in_dollar_quote and dollar_tag is None:
                            in_dollar_quote = False
                            dollar_tag = None
                        else:
                            in_dollar_quote = True
                            dollar_tag = None
                        current_statement += char + next_char
                        i += 2
                        continue
                    elif next_char.isalnum() or next_char == '_':
                        # Tagged dollar quote like $tag$
                        tag_start = i + 1
                        tag_end = tag_start
                        while tag_end < len(extended_schema_sql) and (extended_schema_sql[tag_end].isalnum() or extended_schema_sql[tag_end] == '_'):
                            tag_end += 1
                        if tag_end < len(extended_schema_sql) and extended_schema_sql[tag_end] == '$':
                            tag = extended_schema_sql[tag_start:tag_end]
                            if in_dollar_quote and dollar_tag == tag:
                                in_dollar_quote = False
                                dollar_tag = None
                            else:
                                in_dollar_quote = True
                                dollar_tag = tag
                            current_statement += extended_schema_sql[i:tag_end+1]
                            i = tag_end + 1
                            continue
                
                current_statement += char
                
                # If we hit a semicolon and we're not in a dollar-quoted string, it's the end of a statement
                if char == ';' and not in_dollar_quote:
                    statement = current_statement.strip()
                    if statement:
                        statements.append(statement)
                    current_statement = ""
                
                i += 1
            
            # Add any remaining statement
            if current_statement.strip():
                statements.append(current_statement.strip())
            
            for statement in statements:
                if statement and not statement.isspace():
                    try:
                        await neon_db.execute_command(statement)
                        # Print first part of statement for logging
                        first_line = statement.split('\n')[0][:60].strip()
                        print(f"[OK] Executed: {first_line}...")
                    except Exception as e:
                        # Ignore errors for IF NOT EXISTS statements
                        error_str = str(e).lower()
                        if "already exists" not in error_str and "does not exist" not in error_str:
                            print(f"[WARNING] {e}")
                            print(f"   Statement preview: {statement[:150]}...")
        
        print("\nDatabase schema initialized successfully!")
        
        # Verify PostGIS is enabled
        try:
            result = await neon_db.execute_fetchone(
                "SELECT PostGIS_version() as version"
            )
            if result:
                print(f"[OK] PostGIS version: {result.get('version', 'Unknown')}")
        except Exception as e:
            print(f"[WARNING] Could not verify PostGIS version: {e}")
        
    except Exception as e:
        print(f"[ERROR] Error initializing database: {e}")
        raise
    finally:
        await neon_db.disconnect()


if __name__ == "__main__":
    asyncio.run(init_database())

