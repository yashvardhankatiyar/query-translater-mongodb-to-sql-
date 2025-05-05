import React, { useState, useEffect } from 'react';
import { 
  View, 
  TextInput, 
  TouchableOpacity, 
  Text, 
  StyleSheet, 
  ScrollView, 
  StatusBar,
  ActivityIndicator,
  Animated,
  Keyboard,
  Dimensions,
  Clipboard,
  Alert,
  Platform
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';

export default function App() {
  const [sqlQuery, setSqlQuery] = useState('');
  const [mongoQuery, setMongoQuery] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('sql');
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  
  const fadeAnim = useState(new Animated.Value(0))[0];
  const slideAnim = useState(new Animated.Value(-300))[0];

  useEffect(() => {
    Animated.timing(
      fadeAnim,
      {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true
      }
    ).start();
  }, []);

  useEffect(() => {
    if (result) {
      Animated.sequence([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true
        })
      ]).start();
    }
  }, [result]);

  const toggleHistory = () => {
    Animated.timing(
      slideAnim,
      {
        toValue: showHistory ? -300 : 0,
        duration: 300,
        useNativeDriver: true
      }
    ).start();
    setShowHistory(!showHistory);
  };

  const handleSQLtoMongo = async () => {
    if (!sqlQuery.trim()) return;
    
    Keyboard.dismiss();
    setLoading(true);
    try {
      const res = await fetch('http://192.168.209.136:5000/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: sqlQuery })
      });
      const data = await res.json();
      const newResult = data.mongo_command || data.error;
      setResult(newResult);
      
      // Add to history
      setHistory(prev => [...prev, {
        type: 'SQL to MongoDB',
        input: sqlQuery,
        output: newResult,
        timestamp: new Date().toLocaleString()
      }]);
    } catch (error) {
      setResult(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleMongoToSQL = async () => {
    if (!mongoQuery.trim()) return;
    
    Keyboard.dismiss();
    setLoading(true);
    try {
      const res = await fetch('http://192.168.209.136:5000/reverse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mongo: mongoQuery })
      });
      const data = await res.json();
      const newResult = data.sql || data.error;
      setResult(newResult);
      
      // Add to history
      setHistory(prev => [...prev, {
        type: 'MongoDB to SQL',
        input: mongoQuery,
        output: newResult,
        timestamp: new Date().toLocaleString()
      }]);
    } catch (error) {
      setResult(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    Clipboard.setString(result);
    Alert.alert('Copied to clipboard!');
  };

  const clearHistory = () => {
    setHistory([]);
  };

  const loadHistoryItem = (item) => {
    if (item.type === 'SQL to MongoDB') {
      setSqlQuery(item.input);
      setActiveTab('sql');
    } else {
      setMongoQuery(item.input);
      setActiveTab('mongo');
    }
    setResult(item.output);
    toggleHistory();
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <LinearGradient
        colors={['#9370DB', '#8A2BE2']}
        style={styles.header}
        start={{x: 0, y: 0}} end={{x: 1, y: 0}}
      >
        <Text style={styles.heading}>SQL ⟷ MongoDB</Text>
        <Text style={styles.subheading}>Query Translator</Text>
        
        <TouchableOpacity 
          style={styles.historyButton} 
          onPress={toggleHistory}
        >
          <Text style={styles.historyButtonText}>
            {showHistory ? 'Close' : 'History'}
          </Text>
        </TouchableOpacity>
      </LinearGradient>

      <Animated.View 
        style={[
          styles.historyPanel, 
          { transform: [{ translateX: slideAnim }] }
        ]}
      >
        <Text style={styles.historyTitle}>Translation History</Text>
        {history.length === 0 ? (
          <Text style={styles.emptyHistory}>No translations yet</Text>
        ) : (
          <ScrollView style={styles.historyList}>
            {history.map((item, index) => (
              <TouchableOpacity 
                key={index} 
                style={styles.historyItem}
                onPress={() => loadHistoryItem(item)}
              >
                <Text style={styles.historyItemType}>{item.type}</Text>
                <Text style={styles.historyItemInput} numberOfLines={1}>
                  {item.input}
                </Text>
                <Text style={styles.historyItemTime}>{item.timestamp}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
        <TouchableOpacity 
          style={styles.clearHistoryButton} 
          onPress={clearHistory}
        >
          <Text style={styles.clearHistoryText}>Clear History</Text>
        </TouchableOpacity>
      </Animated.View>

      <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={[
            styles.tab, 
            activeTab === 'sql' && styles.activeTab
          ]}
          onPress={() => setActiveTab('sql')}
        >
          <Text style={[
            styles.tabText, 
            activeTab === 'sql' && styles.activeTabText
          ]}>
            SQL → MongoDB
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[
            styles.tab, 
            activeTab === 'mongo' && styles.activeTab
          ]}
          onPress={() => setActiveTab('mongo')}
        >
          <Text style={[
            styles.tabText, 
            activeTab === 'mongo' && styles.activeTabText
          ]}>
            MongoDB → SQL
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={styles.contentContainer}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {activeTab === 'sql' ? (
          <>
            <Text style={styles.label}>Enter SQL Query:</Text>
            <TextInput
              style={styles.input}
              placeholder="SELECT * FROM users WHERE age > 18"
              placeholderTextColor="#9370DB70"
              value={sqlQuery}
              onChangeText={setSqlQuery}
              multiline
              numberOfLines={5}
            />
            <TouchableOpacity 
              style={styles.button}
              onPress={handleSQLtoMongo}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Translate to MongoDB</Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.label}>Enter MongoDB Command:</Text>
            <TextInput
              style={styles.input}
              placeholder="db.users.find({ age: { $gt: 18 } })"
              placeholderTextColor="#9370DB70"
              value={mongoQuery}
              onChangeText={setMongoQuery}
              multiline
              numberOfLines={5}
            />
            <TouchableOpacity 
              style={styles.button}
              onPress={handleMongoToSQL}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Translate to SQL</Text>
              )}
            </TouchableOpacity>
          </>
        )}

        {result ? (
          <Animated.View 
            style={[styles.resultContainer, { opacity: fadeAnim }]}
          >
            <View style={styles.resultHeader}>
              <Text style={styles.resultLabel}>Result:</Text>
              <TouchableOpacity onPress={copyToClipboard}>
                <Text style={styles.copyButton}>Copy</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.resultTextContainer}>
              <Text style={styles.resultText}>{result}</Text>
            </View>
          </Animated.View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const { width, height } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f5ff',
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 50 : 30,
    paddingBottom: 20,
    alignItems: 'center',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
    position: 'relative',
  },
  heading: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 5,
  },
  subheading: {
    fontSize: 16,
    color: '#fff',
    opacity: 0.8,
  },
  historyButton: {
    position: 'absolute',
    right: 15,
    top: Platform.OS === 'ios' ? 50 : 30,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  historyButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  historyPanel: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 300,
    height: '100%',
    backgroundColor: '#fff',
    zIndex: 10,
    padding: 20,
    paddingTop: Platform.OS === 'ios' ? 50 : 30,
    shadowColor: '#000',
    shadowOffset: { width: 5, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 10,
  },
  historyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#9370DB',
    marginBottom: 20,
  },
  historyList: {
    flex: 1,
  },
  historyItem: {
    backgroundColor: '#f0e6ff',
    padding: 15,
    marginBottom: 10,
    borderRadius: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#9370DB',
  },
  historyItemType: {
    fontWeight: 'bold',
    color: '#9370DB',
    marginBottom: 5,
  },
  historyItemInput: {
    color: '#333',
    marginBottom: 5,
  },
  historyItemTime: {
    color: '#999',
    fontSize: 12,
  },
  emptyHistory: {
    color: '#999',
    textAlign: 'center',
    marginTop: 20,
  },
  clearHistoryButton: {
    marginTop: 20,
    padding: 12,
    backgroundColor: '#f0e6ff',
    borderRadius: 8,
    alignItems: 'center',
  },
  clearHistoryText: {
    color: '#9370DB',
    fontWeight: '600',
  },
  tabContainer: {
    flexDirection: 'row',
    padding: 10,
    backgroundColor: '#f8f5ff',
  },
  tab: {
    flex: 1,
    padding: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: '#ddd',
  },
  activeTab: {
    borderBottomColor: '#9370DB',
  },
  tabText: {
    color: '#888',
    fontWeight: '600',
  },
  activeTabText: {
    color: '#9370DB',
  },
  contentContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#555',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 15,
    fontSize: 16,
    color: '#333',
    minHeight: 120,
    textAlignVertical: 'top',
    marginBottom: 15,
    shadowColor: '#9370DB',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  button: {
    backgroundColor: '#9370DB',
    borderRadius: 30,
    paddingVertical: 15,
    alignItems: 'center',
    shadowColor: '#9370DB',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  resultContainer: {
    marginTop: 30,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    shadowColor: '#9370DB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  resultLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#555',
  },
  copyButton: {
    color: '#9370DB',
    fontWeight: '600',
  },
  resultTextContainer: {
    backgroundColor: '#f8f5ff',
    padding: 15,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#9370DB',
  },
  resultText: {
    fontSize: 16,
    color: '#333',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
});