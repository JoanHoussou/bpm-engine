#!/usr/bin/env python3
"""BPM Engine CLI"""

import sys
import json
import argparse
from bpm_client import BpmClient, BpmClientError


def main():
    parser = argparse.ArgumentParser(prog='bpm', description='BPM Engine CLI')
    parser.add_argument('command', choices=['list', 'schema', 'execute', 'status', 'approve', 'reject'])
    parser.add_argument('arg1', nargs='?', help='First argument (type or execution_id)')
    parser.add_argument('arg2', nargs='?', help='Second argument (payload or comment)')
    parser.add_argument('--url', default='http://localhost:3000', help='BPM URL')
    parser.add_argument('--api-key', help='API Key')
    parser.add_argument('--json', action='store_true', help='JSON output')
    
    args = parser.parse_args(sys.argv[1:2])
    
    # Load config if exists
    config_url = args.url
    config_key = args.api_key
    
    if not config_key:
        try:
            import os
            home = os.path.expanduser("~")
            import configparser
            config = configparser.ConfigParser()
            config.read(f"{home}/.bpm/config.ini")
            if config.has_section('bpm'):
                config_url = config.get('bpm', 'url', fallback=config_url)
                config_key = config.get('bpm', 'api_key', fallback=config_key)
        except:
            pass
    
    if not config_key:
        print("Erreur: API Key requise. Utilisez --api-key ou configurez avec 'bpm init'")
        sys.exit(1)
    
    bpm = BpmClient(config_url, config_key)
    
    try:
        if args.command == 'list':
            workflows = bpm.list_workflows()
            if args.json:
                print(json.dumps(workflows, indent=2))
            else:
                print(f"\n{len(workflows)} workflows disponibles:\n")
                for w in workflows:
                    print(f"  {w['type']:30} {w.get('version', '1.0.0'):10} {w['steps_count']} étapes")
        
        elif args.command == 'schema':
            if not args.arg1:
                print("Usage: bpm schema <type>")
                sys.exit(1)
            schema = bpm.get_schema(args.arg1)
            if args.json:
                print(json.dumps(schema, indent=2))
            else:
                print(f"\n=== Schema: {schema['type']} ===")
                print(f"Version: {schema['version']}")
                print(f"\nChamps requis: {', '.join(schema.get('required_payload_fields', []))}")
                print(f"Exemple: {json.dumps(schema.get('example_payload', {}))}")
        
        elif args.command == 'execute':
            if not args.arg1:
                print("Usage: bpm execute <type> '<json_payload>'")
                sys.exit(1)
            payload = {}
            if args.arg2:
                payload = json.loads(args.arg2)
            result = bpm.execute(args.arg1, payload)
            if args.json:
                print(json.dumps(result, indent=2))
            else:
                print(f"\n✓ Exécution démarrée!")
                print(f"  ID: {result['execution_id']}")
                print(f"  Status: {result['status']}")
        
        elif args.command == 'status':
            if not args.arg1:
                print("Usage: bpm status <execution_id>")
                sys.exit(1)
            result = bpm.get_status(args.arg1)
            if args.json:
                print(json.dumps(result, indent=2))
            else:
                print(f"\n=== Execution: {result['execution_id']} ===")
                print(f"Status: {result['status']}")
        
        elif args.command == 'approve':
            if not args.arg1:
                print("Usage: bpm approve <execution_id> [comment]")
                sys.exit(1)
            comment = args.arg2
            result = bpm.approve(args.arg1, comment)
            print(f"\n✓ Approuvé! Status: {result['status']}")
        
        elif args.command == 'reject':
            if not args.arg1:
                print("Usage: bpm reject <execution_id> [comment]")
                sys.exit(1)
            comment = args.arg2
            result = bpm.reject(args.arg1, comment)
            print(f"\n✓ Rejeté! Status: {result['status']}")
    
    except BpmClientError as e:
        print(f"Erreur: {e.message}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Erreur: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
