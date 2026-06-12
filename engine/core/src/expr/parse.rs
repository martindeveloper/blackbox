use crate::error::EngineError;

use super::ast::{Expr, ExprValue};

pub fn parse_expr(input: &str) -> Result<Expr, EngineError> {
    let tokens = tokenize(input)?;
    let mut parser = Parser { tokens, pos: 0 };
    let expr = parser.parse_or()?;
    if parser.pos < parser.tokens.len() {
        return Err(EngineError::ExpressionError(format!(
            "unexpected token near '{:?}'",
            parser.tokens[parser.pos]
        )));
    }
    Ok(expr)
}

#[derive(Debug, Clone, PartialEq)]
enum Token {
    Number(i32),
    String(String),
    Ident(String),
    Op(String),
    LParen,
    RParen,
    Comma,
}

struct Parser {
    tokens: Vec<Token>,
    pos: usize,
}

impl Parser {
    fn parse_or(&mut self) -> Result<Expr, EngineError> {
        let mut left = self.parse_and()?;
        while self.match_op(&["||", "or"]) {
            let right = self.parse_and()?;
            left = Expr::Op {
                op: "or".to_string(),
                left: Box::new(left),
                right: Some(Box::new(right)),
            };
        }
        Ok(left)
    }

    fn parse_and(&mut self) -> Result<Expr, EngineError> {
        let mut left = self.parse_comparison()?;
        while self.match_op(&["&&", "and"]) {
            let right = self.parse_comparison()?;
            left = Expr::Op {
                op: "and".to_string(),
                left: Box::new(left),
                right: Some(Box::new(right)),
            };
        }
        Ok(left)
    }

    fn parse_comparison(&mut self) -> Result<Expr, EngineError> {
        let mut left = self.parse_additive()?;
        while let Some(op) = self.match_one_of(&["==", "!=", ">=", "<=", ">", "<"]) {
            let right = self.parse_additive()?;
            left = Expr::Op {
                op,
                left: Box::new(left),
                right: Some(Box::new(right)),
            };
        }
        Ok(left)
    }

    fn parse_additive(&mut self) -> Result<Expr, EngineError> {
        let mut left = self.parse_unary()?;
        while let Some(op) = self.match_one_of(&["+", "-"]) {
            let right = self.parse_unary()?;
            left = Expr::Op {
                op,
                left: Box::new(left),
                right: Some(Box::new(right)),
            };
        }
        Ok(left)
    }

    fn parse_unary(&mut self) -> Result<Expr, EngineError> {
        if self.match_op(&["!", "not"]) {
            let operand = self.parse_unary()?;
            return Ok(Expr::Op {
                op: "not".to_string(),
                left: Box::new(operand),
                right: None,
            });
        }
        self.parse_primary()
    }

    fn parse_primary(&mut self) -> Result<Expr, EngineError> {
        let token = self.tokens.get(self.pos).cloned();
        match token {
            Some(Token::Number(n)) => {
                self.pos += 1;
                Ok(Expr::Lit(ExprValue::Number(n)))
            }
            Some(Token::String(s)) => {
                self.pos += 1;
                Ok(Expr::Lit(ExprValue::String(s)))
            }
            Some(Token::Ident(name)) if name == "true" || name == "false" => {
                self.pos += 1;
                Ok(Expr::Lit(ExprValue::Bool(name == "true")))
            }
            Some(Token::Ident(name)) => {
                self.pos += 1;
                if self.peek() == Some(&Token::LParen) {
                    self.pos += 1;
                    let mut args = Vec::new();
                    if self.peek() != Some(&Token::RParen) {
                        loop {
                            args.push(self.parse_or()?);
                            if self.peek() == Some(&Token::Comma) {
                                self.pos += 1;
                                continue;
                            }
                            break;
                        }
                    }
                    self.expect(Token::RParen)?;
                    Ok(Expr::Call { call: name, args })
                } else {
                    Ok(Expr::Var { var: name })
                }
            }
            Some(Token::LParen) => {
                self.pos += 1;
                let expr = self.parse_or()?;
                self.expect(Token::RParen)?;
                Ok(expr)
            }
            other => Err(EngineError::ExpressionError(format!(
                "unexpected token: {other:?}"
            ))),
        }
    }

    fn peek(&self) -> Option<&Token> {
        self.tokens.get(self.pos)
    }

    fn expect(&mut self, expected: Token) -> Result<(), EngineError> {
        match self.tokens.get(self.pos) {
            Some(token) if *token == expected => {
                self.pos += 1;
                Ok(())
            }
            _ => Err(EngineError::ExpressionError(format!(
                "expected {expected:?}"
            ))),
        }
    }

    fn match_op(&mut self, ops: &[&str]) -> bool {
        if let Some(Token::Op(op)) = self.peek()
            && ops.contains(&op.as_str())
        {
            self.pos += 1;
            return true;
        }
        if let Some(Token::Ident(name)) = self.peek()
            && ops.contains(&name.as_str())
        {
            self.pos += 1;
            return true;
        }
        false
    }

    fn match_one_of(&mut self, ops: &[&str]) -> Option<String> {
        if let Some(Token::Op(op)) = self.peek()
            && ops.contains(&op.as_str())
        {
            let op = op.clone();
            self.pos += 1;
            return Some(op);
        }
        None
    }
}

fn tokenize(input: &str) -> Result<Vec<Token>, EngineError> {
    let mut tokens = Vec::new();
    let mut chars = input.chars().peekable();

    while let Some(ch) = chars.peek().copied() {
        if ch.is_whitespace() {
            chars.next();
            continue;
        }

        if ch.is_ascii_digit() {
            let mut digits = String::new();
            while let Some(c) = chars.peek().copied()
                && c.is_ascii_digit()
            {
                digits.push(c);
                chars.next();
            }
            let number: i32 = digits
                .parse()
                .map_err(|_| EngineError::ExpressionError("invalid number".to_string()))?;
            tokens.push(Token::Number(number));
            continue;
        }

        if ch == '"' || ch == '\'' {
            let quote = ch;
            chars.next();
            let mut value = String::new();
            for c in chars.by_ref() {
                if c == quote {
                    break;
                }
                value.push(c);
            }
            tokens.push(Token::String(value));
            continue;
        }

        if ch.is_ascii_alphabetic() || ch == '_' {
            let mut ident = String::new();
            while let Some(c) = chars.peek().copied()
                && (c.is_ascii_alphanumeric() || c == '_' || c == '.')
            {
                ident.push(c);
                chars.next();
            }
            tokens.push(Token::Ident(ident));
            continue;
        }

        if matches!(ch, '(' | ')' | ',') {
            tokens.push(match ch {
                '(' => Token::LParen,
                ')' => Token::RParen,
                ',' => Token::Comma,
                _ => unreachable!(),
            });
            chars.next();
            continue;
        }

        let mut op = ch.to_string();
        chars.next();
        if let Some(next) = chars.peek().copied()
            && matches!(
                (ch, next),
                ('=', '=')
                    | ('!', '=')
                    | ('>', '=')
                    | ('<', '=')
                    | ('&', '&')
                    | ('|', '|')
                    | ('+', '+')
                    | ('-', '-')
            )
        {
            op.push(next);
            chars.next();
        }
        tokens.push(Token::Op(op));
    }

    Ok(tokens)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_comparison_expression() {
        let expr = parse_expr("stat.logic >= 3").unwrap();
        assert!(matches!(expr, Expr::Op { .. }));
    }

    #[test]
    fn parses_function_call() {
        let expr = parse_expr("hasItem('burned_access_card', 1)").unwrap();
        assert!(matches!(expr, Expr::Call { .. }));
    }
}
