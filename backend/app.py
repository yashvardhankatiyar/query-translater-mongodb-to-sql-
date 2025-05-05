from flask import Flask, request, jsonify
import sqlparse
from sqlparse.sql import IdentifierList, Identifier, Where
from sqlparse.tokens import Keyword, DML
import json
import re

app = Flask(__name__)

# ===== SQL → MongoDB =====
class SQLToMongoTranslator:
    def translate(self, sql: str) -> dict:
        stmt = sqlparse.parse(sql)[0]
        result = {
            'collection': None,
            'filter': {},
            'projection': None,
            'sort': None,
            'limit': None
        }

        tokens = [t for t in stmt.tokens if not t.is_whitespace]
        select_fields, where_clause, order_clause, limit_clause = [], None, None, None

        i = 0
        while i < len(tokens):
            tok = tokens[i]

            if tok.ttype is DML and tok.value.upper() == 'SELECT':
                j = i + 1
                while not (tokens[j].ttype is Keyword and tokens[j].value.upper() == 'FROM'):
                    if isinstance(tokens[j], IdentifierList):
                        for idf in tokens[j].get_identifiers():
                            select_fields.append(idf.get_name())
                    elif isinstance(tokens[j], Identifier):
                        select_fields.append(tokens[j].get_name())
                    j += 1
                i = j

            elif tok.ttype is Keyword and tok.value.upper() == 'FROM':
                coll_tok = tokens[i+1]
                # always use raw token value for collection name
                result['collection'] = getattr(coll_tok, 'get_name', lambda: coll_tok.value)()
                i += 2
                continue

            elif isinstance(tok, Where):
                where_clause = tok

            elif tok.ttype is Keyword and tok.value.upper() == 'ORDER':
                if i+2 < len(tokens) and tokens[i+1].value.upper() == 'BY':
                    order_clause = tokens[i+2]

            elif tok.ttype is Keyword and tok.value.upper() == 'LIMIT':
                limit_clause = tokens[i+1]

            i += 1

        # projection
        if select_fields and select_fields != ['*']:
            result['projection'] = {f: 1 for f in select_fields}

        # filter
        if where_clause:
            result['filter'] = self._parse_where(where_clause)

        # sort
        if order_clause:
            sort_list = []
            for part in order_clause.value.split(','):
                fld, *ordr = part.strip().split()
                direction = -1 if ordr and ordr[0].upper() == 'DESC' else 1
                sort_list.append((fld, direction))
            result['sort'] = sort_list

        # limit
        if limit_clause:
            try:
                result['limit'] = int(limit_clause.value)
            except ValueError:
                pass

        return result

    def _parse_where(self, where_token: Where) -> dict:
        expr = where_token.value.lstrip('WHERE ').strip()
        replacements = [
            ('<>', '$ne'), ('!=', '$ne'),
            ('<=', '$lte'), ('>=', '$gte'),
            ('=', '$eq'), ('<', '$lt'), ('>', '$gt')
        ]
        for sql_op, mongo_op in replacements:
            expr = expr.replace(sql_op, f' {mongo_op} ')

        if ' AND ' in expr:
            parts, comb = expr.split(' AND '), '$and'
        elif ' OR ' in expr:
            parts, comb = expr.split(' OR '), '$or'
        else:
            parts, comb = [expr], None

        clauses = []
        for part in parts:
            fld, op, val = part.strip().split(maxsplit=2)
            val = val.strip().strip("'\"")
            try:
                val = float(val) if '.' in val else int(val)
            except ValueError:
                pass
            clauses.append({fld: {op: val}})

        return {comb: clauses} if comb else clauses[0]

# ===== MongoDB → SQL =====
class MongoToSQLTranslator:
    def translate(self, mongo_cmd: str) -> str:
        # regex to extract parts
        pattern = (
            r"db\.(?P<coll>\w+)\.find\("  # collection
            r"(?P<filter>\{.*?\})\s*,\s*(?P<proj>\{.*?\})\)"
            r"(?:\.sort\((?P<sort>\[.*?\])\))?"
            r"(?:\.limit\((?P<limit>\d+)\))?"
        )
        m = re.match(pattern, mongo_cmd)
        if not m:
            raise ValueError("Invalid MongoDB command format")

        coll = m.group('coll')
        filt = json.loads(m.group('filter'))
        proj = json.loads(m.group('proj'))
        sort = json.loads(m.group('sort')) if m.group('sort') else None
        limit = int(m.group('limit')) if m.group('limit') else None

        # SELECT fields
        fields = ', '.join(proj.keys()) if proj else '*'
        sql = f"SELECT {fields} FROM {coll}"

        # WHERE
        if filt:
            def fmt(cond):
                field, expr = next(iter(cond.items()))
                op, val = next(iter(expr.items()))
                rev_map = {'$eq':'=', '$ne':'!=', '$lt':'<', '$lte':'<=', '$gt':'>', '$gte':'>='}
                op_sql = rev_map.get(op, op)
                v = f"'{val}'" if isinstance(val, str) else val
                return f"{field} {op_sql} {v}"

            if '$and' in filt or '$or' in filt:
                comb = '$and' if '$and' in filt else '$or'
                clauses = [fmt(c) for c in filt[comb]]
                sep = ' AND ' if comb=='$and' else ' OR '
                sql += f" WHERE {sep.join(clauses)}"
            else:
                sql += f" WHERE {fmt(filt)}"

        # ORDER BY
        if sort:
            parts = [f"{fld} {'DESC' if d==-1 else 'ASC'}" for fld, d in sort]
            sql += " ORDER BY " + ', '.join(parts)

        # LIMIT
        if limit is not None:
            sql += f" LIMIT {limit}"

        return sql

# construct Mongo shell command

def build_mongo_command(mq: dict) -> str:
    coll = mq['collection']
    filter_str     = json.dumps(mq.get('filter', {}))
    projection_str = json.dumps(mq['projection']) if mq.get('projection') else '{}'
    cmd = f"db.{coll}.find({filter_str}, {projection_str})"
    if mq.get('sort'):
        cmd += f".sort({json.dumps([[f,d] for f,d in mq['sort']])})"
    if mq.get('limit') is not None:
        cmd += f".limit({mq['limit']})"
    return cmd

@app.route('/translate', methods=['POST'])
def translate_sql():
    data = request.get_json()
    sql = data.get('sql')
    if not sql:
        return jsonify({'error': 'SQL query is required'}), 400
    try:
        mq = SQLToMongoTranslator().translate(sql)
        return jsonify({'mongo_command': build_mongo_command(mq)})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/reverse', methods=['POST'])
def translate_mongo():
    data = request.get_json()
    mongo_cmd = data.get('mongo')
    if not mongo_cmd:
        return jsonify({'error': 'MongoDB command is required'}), 400
    try:
        sql = MongoToSQLTranslator().translate(mongo_cmd)
        return jsonify({'sql': sql})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)