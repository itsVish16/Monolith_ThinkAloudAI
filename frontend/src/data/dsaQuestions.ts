export interface TestCase {
  input: string;
  expected: string;
  isPublic: boolean;
}

export interface Question {
  id: string;
  title: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  category: string;
  acceptance: string;
  timeLimit: string;
  memoryLimit: string;
  description: string;
  starterCode: {
    javascript: string;
    python: string;
    cpp: string;
    java: string;
  };
  testCases: TestCase[];
  hints: string[];
  optimalComplexity: {
    time: string;
    space: string;
  };
}

export const dsaQuestions: Question[] = [
  {
    id: 'two-sum',
    title: 'Two Sum',
    difficulty: 'Easy',
    category: 'Arrays & Hashing',
    acceptance: '52.4%',
    timeLimit: '1.0s',
    memoryLimit: '256MB',
    description: `
<p>Given an array of integers <code>nums</code> and an integer <code>target</code>, return <em>indices of the two numbers such that they add up to <code>target</code></em>.</p>
<p>You may assume that each input would have <strong><em>exactly</em> one solution</strong>, and you may not use the <em>same</em> element twice.</p>
<p>You can return the answer in any order.</p>

<h4 class="section-title">Example 1:</h4>
<pre>
<strong>Input:</strong> nums = [2,7,11,15], target = 9
<strong>Output:</strong> [0,1]
<strong>Explanation:</strong> Because nums[0] + nums[1] == 9, we return [0, 1].
</pre>

<h4 class="section-title">Example 2:</h4>
<pre>
<strong>Input:</strong> nums = [3,2,4], target = 6
<strong>Output:</strong> [1,2]
</pre>

<h4 class="section-title">Example 3:</h4>
<pre>
<strong>Input:</strong> nums = [3,3], target = 6
<strong>Output:</strong> [0,1]
</pre>

<h4 class="section-title">Constraints:</h4>
<ul>
  <li><code>2 &lt;= nums.length &lt;= 10<sup>4</sup></code></li>
  <li><code>-10<sup>9</sup> &lt;= nums[i] &lt;= 10<sup>9</sup></code></li>
  <li><code>-10<sup>9</sup> &lt;= target &lt;= 10<sup>9</sup></code></li>
  <li><strong>Only one valid answer exists.</strong></li>
</ul>

<h4 class="section-title">Follow-up:</h4>
<p>Can you come up with an algorithm that is less than <code>O(n<sup>2</sup>)</code> time complexity?</p>
    `,
    starterCode: {
      javascript: `/**
 * @param {number[]} nums
 * @param {number} target
 * @return {number[]}
 */
function twoSum(nums, target) {
    // Write your code here
    
};`,
      python: `class Solution:
    def twoSum(self, nums: List[int], target: int) -> List[int]:
        # Write your code here
        pass`,
      cpp: `#include <vector>

class Solution {
public:
    std::vector<int> twoSum(std::vector<int>& nums, int target) {
        // Write your code here
        
    }
};`,
      java: `import java.util.HashMap;
import java.util.Map;

class Solution {
    public int[] twoSum(int[] nums, int target) {
        // Write your code here
        return new int[]{};
    }
}`
    },
    testCases: [
      { input: 'nums = [2,7,11,15], target = 9', expected: '[0,1]', isPublic: true },
      { input: 'nums = [3,2,4], target = 6', expected: '[1,2]', isPublic: true },
      { input: 'nums = [3,3], target = 6', expected: '[0,1]', isPublic: true },
      { input: 'nums = [-1,-3,-5,7,8], target = 2', expected: '[1,3]', isPublic: false }
    ],
    hints: [
      "A brute force approach would be to loop through each element and find if there is another value that equals target - x. What is the time complexity of this?",
      "Can we use something that helps search for the complement (target - x) in O(1) time?",
      "Yes, a hash map or hash set. As we traverse the array, we can check if the complement exists in our map. If it does, we found the pair. If not, we insert the current element and its index."
    ],
    optimalComplexity: {
      time: 'O(N)',
      space: 'O(N)'
    }
  },
  {
    id: 'lru-cache',
    title: 'LRU Cache',
    difficulty: 'Medium',
    category: 'Design / Linked List',
    acceptance: '42.8%',
    timeLimit: '2.0s',
    memoryLimit: '512MB',
    description: `
<p>Design a data structure that follows the constraints of a <strong>Least Recently Used (LRU) cache</strong>.</p>
<p>Implement the <code>LRUCache</code> class:</p>
<ul>
  <li><code>LRUCache(int capacity)</code> Initialize the LRU cache with positive size <code>capacity</code>.</li>
  <li><code>int get(int key)</code> Return the value of the <code>key</code> if the key exists, otherwise return <code>-1</code>.</li>
  <li><code>void put(int key, int value)</code> Update the value of the <code>key</code> if the <code>key</code> exists. Otherwise, add the <code>key-value</code> pair to the cache. If the number of keys exceeds the <code>capacity</code> from this operation, <strong>evict</strong> the least recently used key.</li>
</ul>
<p>The functions <code>get</code> and <code>put</code> must each run in <code>O(1)</code> average time complexity.</p>

<h4 class="section-title">Example 1:</h4>
<pre>
<strong>Input</strong>
["LRUCache", "put", "put", "get", "put", "get", "put", "get", "get", "get"]
[[2], [1, 1], [2, 2], [1], [3, 3], [2], [4, 4], [1], [3], [4]]
<strong>Output</strong>
[null, null, null, 1, null, -1, null, -1, 3, 4]

<strong>Explanation:</strong>
LRUCache lRUCache = new LRUCache(2);
lRUCache.put(1, 1); // cache is {1=1}
lRUCache.put(2, 2); // cache is {1=1, 2=2}
lRUCache.get(1);    // return 1
lRUCache.put(3, 3); // LRU key was 2, evicts key 2, cache is {1=1, 3=3}
lRUCache.get(2);    // returns -1 (not found)
lRUCache.put(4, 4); // LRU key was 1, evicts key 1, cache is {4=4, 3=3}
lRUCache.get(1);    // return -1 (not found)
lRUCache.get(3);    // return 3
lRUCache.get(4);    // return 4
</pre>

<h4 class="section-title">Constraints:</h4>
<ul>
  <li><code>1 &lt;= capacity &lt;= 3000</code></li>
  <li><code>0 &lt;= key &lt;= 10<sup>4</sup></code></li>
  <li><code>0 &lt;= value &lt;= 10<sup>5</sup></code></li>
  <li>At most <code>2 * 10<sup>5</sup></code> calls will be made to <code>get</code> and <code>put</code>.</li>
</ul>
    `,
    starterCode: {
      javascript: `class LRUCache {
    /**
     * @param {number} capacity
     */
    constructor(capacity) {
        // Write your code here
    }

    /** 
     * @param {number} key
     * @return {number}
     */
    get(key) {
        // Write your code here
    }

    /** 
     * @param {number} key 
     * @param {number} value
     * @return {void}
     */
    put(key, value) {
        // Write your code here
    }
}`,
      python: `class LRUCache:

    def __init__(self, capacity: int):
        # Write your code here
        pass

    def get(self, key: int) -> int:
        # Write your code here
        return -1

    def put(self, key: int, value: int) -> None:
        # Write your code here
        pass`,
      cpp: `class LRUCache {
public:
    LRUCache(int capacity) {
        // Write your code here
    }
    
    int get(int key) {
        // Write your code here
        return -1;
    }
    
    void put(int key, int value) {
        // Write your code here
    }
};`,
      java: `class LRUCache {

    public LRUCache(int capacity) {
        // Write your code here
    }
    
    public int get(int key) {
        // Write your code here
        return -1;
    }
    
    public void put(int key, int value) {
        // Write your code here
    }
}`
    },
    testCases: [
      { input: 'Capacity = 2, put(1,1), put(2,2), get(1)', expected: '1', isPublic: true },
      { input: 'put(3,3), get(2)', expected: '-1', isPublic: true },
      { input: 'put(4,4), get(1), get(3), get(4)', expected: '-1, 3, 4', isPublic: true }
    ],
    hints: [
      "To achieve O(1) operations for both get and put, we need a way to look up items by key in O(1) time and a way to re-order items in O(1) time.",
      "A hash map gives us O(1) lookup. What data structure allows O(1) insertion and deletion from any position once we have a reference to the node?",
      "A doubly linked list. We can store key-value nodes in a doubly linked list, keeping track of the Head (most recently used) and Tail (least recently used), and map keys to list node references in a hash map."
    ],
    optimalComplexity: {
      time: 'O(1) for both operations',
      space: 'O(Capacity)'
    }
  },
  {
    id: 'longest-palindromic-substring',
    title: 'Longest Palindromic Substring',
    difficulty: 'Medium',
    category: 'Dynamic Programming / Strings',
    acceptance: '33.9%',
    timeLimit: '1.5s',
    memoryLimit: '256MB',
    description: `
<p>Given a string <code>s</code>, return <em>the longest palindromic substring</em> in <code>s</code>.</p>

<h4 class="section-title">Example 1:</h4>
<pre>
<strong>Input:</strong> s = "babad"
<strong>Output:</strong> "bab"
<strong>Explanation:</strong> "aba" is also a valid answer.
</pre>

<h4 class="section-title">Example 2:</h4>
<pre>
<strong>Input:</strong> s = "cbbd"
<strong>Output:</strong> "bb"
</pre>

<h4 class="section-title">Constraints:</h4>
<ul>
  <li><code>1 &lt;= s.length &lt;= 1000</code></li>
  <li><code>s</code> consist of only digits and English letters.</li>
</ul>
    `,
    starterCode: {
      javascript: `/**
 * @param {string} s
 * @return {string}
 */
function longestPalindrome(s) {
    // Write your code here
    
};`,
      python: `class Solution:
    def longestPalindrome(self, s: str) -> str:
        # Write your code here
        pass`,
      cpp: `#include <string>

class Solution {
public:
    std::string longestPalindrome(std::string s) {
        // Write your code here
        
    }
};`,
      java: `class Solution {
    public String longestPalindrome(String s) {
        // Write your code here
        return "";
    }
}`
    },
    testCases: [
      { input: 's = "babad"', expected: '"bab" or "aba"', isPublic: true },
      { input: 's = "cbbd"', expected: '"bb"', isPublic: true },
      { input: 's = "a"', expected: '"a"', isPublic: false }
    ],
    hints: [
      "Can we expand around every potential center? A palindrome is symmetric. How many potential centers are there in a string of length N?",
      "There are 2N - 1 centers (each character, and each gap between two characters).",
      "For each center, expand outwards as long as the characters match. Keep track of the maximum length palindrome found."
    ],
    optimalComplexity: {
      time: 'O(N^2)',
      space: 'O(1)'
    }
  }
];
